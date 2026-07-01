# Swimchain Identity System — Cross-Client Documentation

> Generated: 2026-02-17 | Identity-Owner audit

## Overview

Swimchain uses Ed25519 cryptographic identities with Bech32m-encoded addresses (`cs1...`). Identity is the foundation for all user actions: posting, replying, engaging, sponsoring, and bridging content. Each client implements identity differently depending on its role in the ecosystem.

There are two identity models across clients:

| Model | Storage | Signing | Used By |
|-------|---------|---------|---------|
| **Node-managed** | Private key on Swimchain node disk | RPC `sign_message` call to node | forum-client, feed-client, analytics-client, archiver-client |
| **Browser-managed** | Seed in localStorage | WASM Ed25519 in-browser | chat-client, search-client, bridge-client |

---

## Screenshots

Screenshots are captured from each client's `/identity` route and main page.

To regenerate:
```bash
node docs/clients/identity/take-screenshots.cjs
```

| Client | Identity Page | Main Page |
|--------|:---:|:---:|
| forum-client (5173) | ![forum-identity](forum-client-identity.png) | ![forum-main](forum-client-main.png) |
| feed-client (5179) | ![feed-identity](feed-client-identity.png) | ![feed-main](feed-client-main.png) |
| chat-client (5175) | ![chat-identity](chat-client-identity.png) | ![chat-main](chat-client-main.png) |
| search-client (5174) | ![search-identity](search-client-identity.png) | ![search-main](search-client-main.png) |
| bridge-client (5176) | ![bridge-identity](bridge-client-identity.png) | ![bridge-main](bridge-client-main.png) |
| analytics-client (5178) | ![analytics-identity](analytics-client-identity.png) | ![analytics-main](analytics-client-main.png) |
| archiver-client (5177) | ![archiver-identity](archiver-client-identity.png) | ![archiver-main](archiver-client-main.png) |

**Note:** forum-client, bridge-client, archiver-client, and analytics-client screenshots show WASM loading screens because the WASM modules require longer initialization in headless browser environments. The actual identity pages render correctly in interactive browser sessions. feed-client, chat-client, and search-client render their identity UIs successfully.

---

## Feature Comparison

| Feature | forum | feed | chat | search | bridge | archiver | analytics |
|---------|:-----:|:----:|:----:|:------:|:------:|:--------:|:---------:|
| **Identity Page** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **IdentityProvider** | Yes (node) | Yes (localStorage) | Yes (@swimchain/frontend) | Yes (@swimchain/frontend) | Yes (localStorage) | Yes (node RPC) | Yes (node RPC) |
| **Identity Creation** | Node-managed | Browser PoW + Node | Browser PoW (diff 20) | Browser PoW (diff 20) | Sync from node | Node-managed | Node-managed |
| **AddressDisplay** | Yes (128 lines) | Yes (82 lines) | Yes (@swimchain/frontend) | Yes (@swimchain/frontend) | Yes (64 lines) | Yes (64 lines) | Yes (64 lines) |
| **Display Name Edit** | Yes (RPC, 64 chars) | Yes (RPC, 64 chars) | Yes (RPC, 64 chars) | No | No | Yes (RPC, 64 chars) | Yes (RPC, 64 chars) |
| **Public Key View** | Show/hide + copy | Show/hide + copy | Shown in IdentityCard | Shown in IdentityCard | Show/hide + copy | Show/hide + copy | Show/hide + copy |
| **BackupPromptModal** | Yes (download .txt) | Yes (download .txt) | No | No | No | No | No |
| **RequireIdentity Guard** | Yes | Yes | Yes | No | No | No | No |
| **useSign Hook** | Yes (unified) | No (via keypair) | Yes (via keypair) | No | No | No | No |
| **useDisplayName Hook** | Yes (batch, cached) | No | No | No | No | No | No |
| **UserAvatar** | Yes (162 lines) | No (inline) | Yes (158 lines) | No | No | No | No |
| **Profile Page** | Yes (bio, avatar) | Yes (bio, avatar) | No | No | No | No | No |
| **Seed Import** | Via node config | 64-char hex input | Seed input | No | No (sync only) | No (node) | No (node) |
| **Seed Export/Backup** | Download .txt | Download .txt | No | No | No | No | No |
| **Identity Deletion** | Confirm modal | Confirm modal | window.confirm() | window.confirm() | 2-step inline | No | No |
| **usePassphraseStore** | Yes | Yes | No | No | No | No | No |
| **Presence/Online Status** | No | No | Yes | No | No | No | No |
| **Action PoW** | Yes | Yes | Yes | No | Yes | No | No |

---

## Identity Architecture Tiers

### Tier 1: Full Identity (forum-client)

The reference implementation with all identity features. Score: **16/16**.

- **Node-based signing** — Private keys stay on the node; browser signs via `sign_message` RPC
- **Backup system** — BackupPromptModal forces users to acknowledge seed backup before continuing
- **Profile management** — Edit display name, bio, website, avatar upload (<2MB)
- **Route guards** — `RequireIdentity` component redirects unauthenticated users to `/identity`
- **Display name resolution** — Batch lookup of other users' names via `get_user_profile` RPC (groups of 5, 5-min cache TTL)
- **Unified signing** — `useSign` tries stored keypair first, falls back to node RPC

### Tier 2: Near-Complete Identity (feed-client)

Hybrid model: can use both browser localStorage and node RPC. Score: **13/16**.

- Same backup and profile management as forum-client
- `useStoredKeypair` reconstructs WASM keypair from hex seed for local signing
- `SwimchainProvider` manages WASM module initialization
- Missing standalone `useSign`, `useDisplayName`, and `UserAvatar` components

### Tier 3: Functional Browser Identity (chat-client)

Full client-side identity with gaps in backup and profile. Score: **10/16**.

- **Browser-only keypair** — Ed25519 key generated in WASM, stored in localStorage
- **PoW mining** — Difficulty 20 (~1M hash attempts, 15-30s) to validate identity
- **No backup prompt** — Critical gap; seed can be lost if browser data is cleared
- **Shared components** — Uses `@swimchain/frontend` library for IdentityCard, AddressDisplay, PowProgress
- **Presence system** — Online/away/offline tracking with heartbeat

### Tier 4: Minimal Browser Identity (search-client)

Delegates to shared package, minimal local implementation. Score: **6/16**.

- Everything from `@swimchain/frontend` (IdentityProvider, AddressDisplay, IdentityCard)
- Identity creation with PoW, old identity upgrade detection
- No backup, no display name, no route guards, no profile

### Tier 5: Sync-Based Identity (bridge-client)

Syncs identity from node into localStorage for bridge engine use. Score: **5/16**.

- "Sync Identity from Node" button calls `get_identity_info` RPC
- Exports `getStoredIdentity()` / `saveStoredIdentity()` for non-React bridge engine code
- Re-sync and two-step delete; no creation, backup, or display name

### Tier 6: Read-Only Identity (analytics-client, archiver-client)

Display-only. Fetch identity from node for authenticated operations. Score: **4/16 each**.

- `IdentityProvider` fetches `get_identity_info` on mount
- Display name editing via RPC
- No creation, backup, import, deletion, or profile

---

## Client Details

### forum-client (port 5173)

**Identity source:** Node-managed via `get_identity_info` RPC

The forum client is the reference implementation for identity. It delegates all cryptographic operations to the node — private keys never enter the browser. The identity page displays the node's address and public key, allows editing a display name (up to 64 characters), and shows a backup prompt on first visit.

**Key files (2,080 lines total):**
| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/Identity.tsx` | 422 | Address, pubkey toggle, display name edit, backup prompt trigger |
| `src/pages/Profile.tsx` | 379 | Bio, website, avatar upload (<2MB), PoW-gated saves |
| `src/hooks/useNodeIdentity.tsx` | 227 | RPC identity fetch with retry (500/1500/3000ms) |
| `src/hooks/useSign.ts` | 91 | Unified signing: stored keypair first, then RPC fallback |
| `src/hooks/useDisplayName.ts` | 378 | Batch display name resolution (groups of 5, 5-min cache) |
| `src/hooks/useStoredKeypair.ts` | 143 | Node identity wrapped as keypair API for backward compat |
| `src/hooks/useStoredIdentity.ts` | 72 | Compatibility wrapper, all methods delegate to node |
| `src/components/BackupPromptModal.tsx` | 234 | Focus trap, download .txt, no Escape dismiss, checkbox ack |
| `src/components/AddressDisplay.tsx` | 128 | Truncation, copy, avatar, DM button, profile link |
| `src/components/UserAvatar.tsx` | 162 | Deterministic color from pubkey, initials, sizes xs-xl |
| `src/components/RequireIdentity.tsx` | 59 | Route guard, redirect to /identity, needsUpgrade state |
| `src/providers/IdentityProvider.tsx` | 85 | Context wrapping useNodeIdentity |

**RPC methods used:** `get_identity_info`, `sign_message`, `get_user_profile`, `set_identity_name`, `get_identity_name`, `upload_content`

---

### feed-client (port 5179)

**Identity source:** Browser localStorage + Node RPC fallback

The feed client supports both browser-generated and node-managed identities. Browser identities require PoW mining (difficulty 20) and are stored in localStorage under key `swimchain-identity`.

**Key files (1,205 lines total):**
| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/Identity.tsx` | — | Node identity display, creation, import (64-char hex), delete |
| `src/pages/Profile.tsx` | 521 | Bio, website, avatar upload (<2MB), PoW-gated saves |
| `src/hooks/useStoredIdentity.ts` | 60 | localStorage persistence |
| `src/hooks/useStoredKeypair.ts` | 124 | WASM keypair from seed, cleanup on unmount |
| `src/providers/IdentityProvider.tsx` | 98 | React context with seed+address validation |
| `src/components/AddressDisplay.tsx` | 82 | Truncated (6+6 chars), copy, hover full address |
| `src/components/BackupPromptModal.tsx` | — | Seed show/hide, download .txt, focus trap, forced ack |
| `src/components/RequireIdentity.tsx` | 45 | Route guard with upgrade detection |
| `src/components/IdentityCard.tsx` | 53 | Avatar initials, address, creation date, PoW badge |
| `src/providers/SwimchainProvider.tsx` | 108 | WASM module loader |

**Unique features:** Seed import (64-char hex), educational tips during PoW mining, `usePassphraseStore` for encrypted content

---

### chat-client (port 5175)

**Identity source:** Browser localStorage via `@swimchain/frontend`

The chat client creates identities entirely client-side. Mining happens at difficulty 20 in the browser. Identity is stored in localStorage and used for signing chat messages.

**Key files (1,258 lines total):**
| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/IdentityPage.tsx` | 254 | Create keypair, mine PoW, import seed, view, delete |
| `src/pages/SettingsPage.tsx` | 271 | Display name edit, chat preferences, debug panel |
| `src/components/RequireIdentity.tsx` | 47 | Route guard with returnTo preservation |
| `src/components/UserAvatar.tsx` | 158 | Deterministic color, online badges, sizes xs-xl |
| `src/hooks/useUserProfile.ts` | 237 | Profile fetch with batch mode and 60s cache |
| `src/contexts/PresenceContext.tsx` | 170 | Online/away/offline with 30s heartbeat |
| `src/contexts/TypingContext.tsx` | — | Typing indicator broadcasting |

**Known issues:**
- CRITICAL: No BackupPromptModal — identity lost on browser clear
- CRITICAL: `PresenceContext.tsx` and `TypingContext.tsx` import from `mocks/data` — broadcasts hardcoded fake addresses in production
- No dedicated profile page (only chat preferences in Settings)
- No `useDisplayName` hook (other users' names not resolved)

---

### search-client (port 5174)

**Identity source:** Browser localStorage via `@swimchain/frontend`

The search client has a minimal identity page using shared components from `@swimchain/frontend`. Primarily a read-only search tool.

**Key files:**
| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/IdentityPage.tsx` | 255 | Generate keypair, mine PoW (diff 20), save, upgrade path |
| `src/App.tsx` | 81 | Route setup with `/identity`, IdentityProvider wrapping |

**Components from @swimchain/frontend:** AddressDisplay, PowProgress, IdentityCard, IdentityProvider

**Gaps:** No backup/export, no display name editing, no RequireIdentity guard, no profile page, no UserAvatar

---

### bridge-client (port 5176)

**Identity source:** Browser localStorage, synced from node

The bridge client stores a copy of the node's identity in localStorage (`swimchain-bridge-identity`) for signing bridged content. Users sync identity from the connected node rather than creating one locally.

**Key files:**
| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/Identity.tsx` | 221 | Sync from node, view, re-sync, 2-step delete |
| `src/providers/IdentityProvider.tsx` | 37 | Thin context wrapper over useStoredIdentity |
| `src/hooks/useStoredIdentity.ts` | 84 | localStorage with non-React helpers for bridge engine |
| `src/components/AddressDisplay.tsx` | 64 | Truncated address with copy |

**Identity flow:**
1. Empty state: "Sync Identity from Node" button
2. Calls `get_identity_info` RPC to fetch address, publicKey, seed
3. Stores locally with `createdAt` timestamp
4. Shows address, public key (toggle), stored-since date
5. "Re-sync from Node" to refresh, "Delete" with two-step confirm

**Unique:** Exports `getStoredIdentity()` / `saveStoredIdentity()` for non-React bridge engine code

---

### analytics-client (port 5178)

**Identity source:** Node-managed via `get_identity_info` RPC

The analytics client displays the node's identity for authenticated analytics operations. Read-only display with display name editing.

**Key files:**
| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/Identity.tsx` | 192 | Node identity display, pubkey toggle, display name edit |
| `src/providers/IdentityProvider.tsx` | 98 | Node RPC fetch with refetch capability |
| `src/components/AddressDisplay.tsx` | 64 | Truncated address with copy |

**RPC:** Uses `VITE_RPC_HOST` and `VITE_RPC_PORT` env vars (defaults: `localhost:19736`).

---

### archiver-client (port 5177)

**Identity source:** Node-managed via `get_identity_info` RPC

Functionally identical to analytics-client's identity implementation except the back link goes to `/dashboard`.

**Key files:**
| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/Identity.tsx` | 192 | Same as analytics-client |
| `src/providers/IdentityProvider.tsx` | 95 | Same pattern, hardcoded RPC URL |
| `src/components/AddressDisplay.tsx` | 64 | Same as analytics-client |

**RPC:** Hard-coded to `http://localhost:19736` (no env var support — inconsistent with analytics-client).

---

## StoredIdentity Type

All clients that store identity locally use this interface:

```typescript
interface StoredIdentity {
  address: string;      // Bech32m-encoded (cs1...)
  publicKey: string;    // 64-char hex-encoded Ed25519 public key
  seed: string;         // 64-char hex-encoded seed (for signing)
  createdAt: number;    // Unix timestamp (seconds)
  powSolution?: {       // bridge-client omits this field
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}
```

**Storage keys:**
| Key | Used By |
|-----|---------|
| `swimchain-identity` | forum-client, feed-client, chat-client, search-client |
| `swimchain-bridge-identity` | bridge-client |
| (Node RPC only, no localStorage) | analytics-client, archiver-client |

---

## RPC Methods Summary

| RPC Method | Auth | Description | Used By |
|------------|:----:|-------------|---------|
| `get_identity_info` | Yes (cookie) | Returns node address, public_key, has_identity | All clients |
| `get_identity_name` | Yes | Returns current display name | forum, feed, chat, archiver, analytics |
| `set_identity_name` | Yes | Sets display name (max 64 chars, null to clear) | forum, feed, chat, archiver, analytics |
| `sign_message` | Yes | Signs hex-encoded message with node keypair | forum, feed |
| `get_user_profile` | Yes | Resolves display name/bio for a public key | forum, chat |
| `upload_content` | Yes | Uploads avatar/content | forum, feed |

---

## Known Issues

| Priority | Client | Issue |
|----------|--------|-------|
| CRITICAL | chat-client | No BackupPromptModal — identity lost on browser clear |
| CRITICAL | chat-client | Mock data in PresenceContext/TypingContext broadcasts fake addresses in production |
| HIGH | search-client | No backup/export — seed not recoverable after creation |
| HIGH | bridge-client | No backup modal (mitigated: can re-sync from node) |
| HIGH | All except forum/feed | AddressDisplay duplicated as identical 64-line copies — should use shared package |
| MEDIUM | search-client | No RequireIdentity route guard — identity not enforced |
| MEDIUM | chat-client | No dedicated profile page (bio, avatar) |
| MEDIUM | feed-client | No standalone useDisplayName hook for batch name resolution |
| MEDIUM | bridge-client | StoredIdentity type missing powSolution field |
| MEDIUM | archiver-client | RPC URL hardcoded to localhost:19736 (no env var support) |
| LOW | search-client | Uses window.confirm() for delete instead of styled modal |
| LOW | analytics/archiver | No identity deletion capability |
| LOW | feed-client | No standalone UserAvatar component (inline avatar logic) |

---

## Recommendations

1. **Add BackupPromptModal to chat-client and search-client** — highest-impact fix for user safety
2. **Extract shared identity package** — analytics, archiver, and bridge all copy-paste the same AddressDisplay. A shared `@swimchain/identity` package would reduce duplication
3. **Remove mock data from chat-client** — PresenceContext and TypingContext should use real user identity, not hardcoded addresses
4. **Add RequireIdentity to search-client** — prevent unauthenticated usage
5. **Standardize RPC URL configuration** — archiver-client should use env vars like analytics-client
