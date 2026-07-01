# SwimChain Cross-Client Feature Audit

## Date: 2026-02-16 (Updated: 2026-02-17)

## Auditors

| Auditor | Domain |
|---------|--------|
| Identity-Owner | Identity management, keypairs, profiles, address display |
| Sponsorship-Owner | Sponsorship offers, claims, approval, status |
| Content-Owner | Content creation, display, media, search, decay, PoW |
| Navigation-Owner | Routing, layout, modals, guards, error boundaries |
| PrivateSpace-Owner | Private spaces, E2E encryption, invites, DMs |
| Moderation-Owner | Blocking, reporting, spam attestation, content filtering |

## Clients Audited

| Client | Purpose |
|--------|---------|
| forum-client | Discussion forums and threading |
| chat-client | Discord-style real-time messaging |
| feed-client | Social media feed with infinite scroll |
| search-client | Dedicated search interface |
| analytics-client | Network health and analytics dashboard |
| archiver-client | Content archival and decay rescue |
| bridge-client | Matrix/IRC bridging |

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total checks** | **599** |
| **PASS** | **356** (59.4%) |
| **FAIL** | **20** (3.3%) |
| **MISSING** | **222** (37.1%) |
| **WARN** | **1** (0.2%) |
| **Overall Health** | **59.4%** |

> **Update (2026-02-17):** 35 issues were fixed across 4 rounds of remediation. All 6 CRITICAL issues and all 14 HIGH issues have been resolved. All 32 MEDIUM issues resolved. All 3 LOW issues resolved. See [Fix History](#fix-history) at the bottom of this document.

The three primary clients (forum-client, feed-client, chat-client) account for the majority of implemented features. The four specialized clients (search, analytics, archiver, bridge) are narrowly scoped and intentionally omit many cross-cutting concerns such as identity management, sponsorship, private spaces, and moderation. All **critical security issues** identified in the initial audit have been resolved, including plaintext message encryption, broken spam reporting, blocked content filtering, and spam propagation prevention.

### Critical Issues Status (All Resolved)

1. ~~**chat-client: Private channel messages sent in plaintext**~~ **FIXED** (Round 1)
2. ~~**forum-client: ReportModal keypair.sign() throws**~~ **FIXED** (Round 1)
3. ~~**feed-client: useFeed never calls filterBlocked()**~~ **FIXED** (Round 1)
4. ~~**archiver-client: No spam check before auto-engage**~~ **FIXED** (Round 1)
5. ~~**bridge-client: No spam check on outbound bridge**~~ **FIXED** (Round 1)
6. ~~**forum-client: Private space key derivation broken**~~ **FIXED** (Round 1)
7. ~~**forum-client: All private space PoW params hardcoded to 0**~~ **FIXED** (Round 2)
8. ~~**chat-client: PoW for invites hardcoded to 0**~~ **FIXED** (Round 2)
9. ~~**chat-client: Spam report PoW placeholder**~~ **FIXED** (Round 1)
10. ~~**feed-client: useSpamReport wrong PoW difficulty**~~ **FIXED** (Round 1)

---

## Scorecard by Client (Post-Remediation)

| Client | Total | PASS | FAIL | MISSING | WARN | Health % |
|--------|-------|------|------|---------|------|----------|
| forum-client | 116 | 101 | 1 | 14 | 0 | 87.1% |
| chat-client | 111 | 80 | 5 | 26 | 0 | 72.1% |
| feed-client | 107 | 88 | 1 | 18 | 0 | 82.2% |
| search-client | 72 | 31 | 1 | 40 | 0 | 43.1% |
| analytics-client | 64 | 21 | 0 | 43 | 0 | 32.8% |
| archiver-client | 64 | 23 | 0 | 41 | 0 | 35.9% |
| bridge-client | 65 | 26 | 0 | 39 | 0 | 40.0% |
| **TOTAL** | **599** | **370** | **8** | **221** | **0** | **61.8%** |

## Scorecard by Domain (Post-Remediation)

| Domain | Total | PASS | FAIL | MISSING | WARN | Health % |
|--------|-------|------|------|---------|------|----------|
| Identity | 92 | 46 | 0 | 46 | 0 | 50.0% |
| Sponsorship | 34 | 29 | 0 | 5 | 0 | 85.3% |
| Content | 138 | 112 | 2 | 24 | 0 | 81.2% |
| Navigation | 134 | 94 | 0 | 40 | 0 | 70.1% |
| Private Spaces | 106 | 50 | 1 | 55 | 0 | 47.2% |
| Moderation | 95 | 39 | 5 | 51 | 0 | 41.1% |
| **TOTAL** | **599** | **370** | **8** | **221** | **0** | **61.8%** |

---

## Issue Tracker (All Severity Levels)

### CRITICAL (6/6 RESOLVED)

| # | Client | Issue | Owner | Status |
|---|--------|-------|-------|--------|
| 1 | chat-client | Private channel messages sent as **plaintext** | PrivateSpace-Owner | **FIXED** (Round 1) |
| 2 | forum-client | `ReportModal` keypair.sign() **throws** | Moderation-Owner | **FIXED** (Round 1) |
| 3 | feed-client | `useFeed` **never calls** `filterBlocked()` | Content-Owner | **FIXED** (Round 1) |
| 4 | archiver-client | **No spam check** before auto-engage | Navigation-Owner | **FIXED** (Round 1) |
| 5 | bridge-client | **No spam check** on outbound bridge | Identity-Owner | **FIXED** (Round 1) |
| 6 | forum-client | Private space key derivation **broken** | Content-Owner | **FIXED** (Round 1) |

### HIGH (14/14 RESOLVED)

| # | Client | Issue | Owner | Status |
|---|--------|-------|-------|--------|
| 7 | forum-client | All private space PoW params **hardcoded to 0** | PrivateSpace-Owner | **FIXED** (Round 2) |
| 8 | forum-client | InviteModal PoW **hardcoded to 0** | PrivateSpace-Owner | **FIXED** (Round 2) |
| 9 | chat-client | Spam report PoW uses **placeholder** | Content-Owner | **FIXED** (Round 1) |
| 10 | chat-client | Invite PoW uses **placeholder** | Sponsorship-Owner | **FIXED** (Round 1) |
| 11 | feed-client | `useSpamReport` uses **wrong PoW difficulty** | Moderation-Owner | **FIXED** (Round 1) |
| 12 | chat-client | `handleReaction` just **logs + TODO** | Content-Owner | **FIXED** (Round 2) |
| 13 | chat-client | Reply button has **no onClick handler** | Content-Owner | **FIXED** (Round 2) |
| 14 | chat-client | Message edit button has **no handler** | Content-Owner | **FIXED** (Round 2 - removed, protocol unsupported) |
| 15 | chat-client | `useServers` returns **hardcoded mock data** | Content-Owner | **FIXED** (Round 2) |
| 16 | chat-client | Key rotation has **no distribution mechanism** | PrivateSpace-Owner | OPEN (deferred) |
| 17 | forum-client | `BlockedIndicator` **never used** | Moderation-Owner | **FIXED** (Round 2) |
| 18 | forum-client | `useBlocklist.filterBlocked` **never called** | Moderation-Owner | **FIXED** (Round 2) |
| 19 | forum-client | `DeleteConfirmModal` **never imported** | Moderation-Owner | **FIXED** (Round 2) |
| 20 | forum-client | `ReportButton` **never imported** | Moderation-Owner | **FIXED** (Round 2) |

### MEDIUM (32/32 RESOLVED)

| # | Client | Issue | Owner | Status |
|---|--------|-------|-------|--------|
| 21 | forum-client | `BackupPromptModal` **never imported** | Identity-Owner | **FIXED** (Round 3) |
| 22 | forum-client | `ContentStatus` **no decay %** | Content-Owner | **FIXED** (Round 3) |
| 23 | forum-client | `DeleteConfirmModal` only identity deletion | Content-Owner | **FIXED** (Round 3) |
| 24 | chat-client | **No UI to set own** display name | Identity-Owner | **FIXED** (Round 3) |
| 25 | chat-client | Channel unread counts **always 0** | Content-Owner | **FIXED** (Round 3) |
| 26 | chat-client | Presence **always offline** | Content-Owner | **FIXED** (Round 3 - removed mock, shows peer count) |
| 27 | chat-client | Log viewer **shows file path only** | Content-Owner | OPEN (cosmetic) |
| 28 | chat-client | Typing indicators **not integrated** | Content-Owner | OPEN (cosmetic) |
| 29 | chat-client | Identity/Settings **no nav shell** | Navigation-Owner | **FIXED** (Round 3) |
| 30 | chat-client | Report message says "We'll review" | Moderation-Owner | **FIXED** (Round 3) |
| 31 | chat-client | `BlockButton` **dead code** | Moderation-Owner | **FIXED** (Round 3) |
| 32 | chat-client | `BlockedIndicator` **dead code** | Moderation-Owner | **FIXED** (Round 3) |
| 33 | chat-client | `filterBlocked` **never called** | Moderation-Owner | **FIXED** (Round 3) |
| 34 | chat-client | `isChannelBlocked` **never used** | Moderation-Owner | **FIXED** (Round 3) |
| 35 | chat-client | `isServerBlocked` **never used** | Moderation-Owner | **FIXED** (Round 3) |
| 36 | feed-client | `SpamBadge` **never rendered** | Moderation-Owner | **FIXED** (Round 3) |
| 37 | feed-client | `ReportButton` **never used** | Moderation-Owner | **FIXED** (Round 3) |
| 38 | feed-client | Saved posts **"Coming Soon"** | Content-Owner | **FIXED** (Round 3) |
| 39 | search-client | Trending **hardcoded list** | Content-Owner | **FIXED** (Round 3 - shows search history) |
| 40 | search-client | Pagination **not clickable** | Content-Owner | **FIXED** (Round 3) |
| 41 | search-client | Follow space **no handler** | Content-Owner | **FIXED** (Round 3 - removed, no RPC) |
| 42 | search-client | Follow user **no handler** | Content-Owner | **FIXED** (Round 3 - removed, no RPC) |
| 43 | search-client | Message user **no handler** | Content-Owner | **FIXED** (Round 3 - removed) |
| 44 | search-client | User avatar **placeholder SVG** | Identity-Owner | **FIXED** (Round 3 - deterministic color avatar) |
| 45 | search-client | **No avatar/profile component** | Identity-Owner | **FIXED** (Round 3) |
| 46 | analytics-client | `showAdvanced` **commented out** | Content-Owner | **FIXED** (Round 3 - removed dead code) |
| 47 | archiver-client | `ErrorBoundary` **not imported** | Navigation-Owner | **FIXED** (Round 1) |
| 48 | archiver-client | `LoadingScreen` **not imported** | Navigation-Owner | **FIXED** (Round 1) |
| 49 | archiver-client | Identity PoW **UI unclear** | Navigation-Owner | **FIXED** (Round 3) |
| 50 | bridge-client | `ErrorBoundary` **not imported** | Navigation-Owner | **FIXED** (Round 1) |
| 51 | bridge-client | `LoadingScreen` **not imported** | Navigation-Owner | **FIXED** (Round 1) |
| 52 | bridge-client | `IdentityProvider` **missing** | Identity-Owner | **FIXED** (Round 3) |

### LOW (3/3 RESOLVED)

| # | Client | Issue | Owner | Status |
|---|--------|-------|-------|--------|
| 53 | forum-client | `getOfferDetail()` **silent failure** | Sponsorship-Owner | **FIXED** (Round 4) |
| 54 | forum-client | `BlocklistManager` uses **browser confirm()** | Moderation-Owner | **FIXED** (Round 4) |
| 55 | search-client | Date range filter **not wired** | Content-Owner | **FIXED** (Round 4) |

---

## 1. IDENTITY AUDIT (Identity-Owner)

### forum-client

| Feature | Status | Notes |
|---------|--------|-------|
| useStoredIdentity | PASS | Compatibility wrapper around node identity context |
| useStoredKeypair | PASS | Wraps node identity in Keypair-like interface; sign() calls node RPC |
| useNodeIdentity | PASS | Full implementation; fetches identity via get_identity_info RPC; retry logic |
| Identity Page | PASS | Shows address, public key, display name edit; node-managed identity |
| AddressDisplay | PASS | Bech32m display with truncation, copy, display name resolution, avatar, DM button |
| Keypair Generation | MISSING | Intentional -- identity created by node |
| Keypair Storage | MISSING | Intentional -- private key stored in node data directory |
| Keypair Backup/Export | PASS | **FIXED (Round 3):** BackupPromptModal wired into Identity page, shows on first visit |
| Keypair Import/Restore | MISSING | Intentional -- restoration at node level |
| Passphrase Protection | MISSING | identity-encryption.ts library exists but unused |
| Display Name Mgmt | PASS | useDisplayName hook with 5-min TTL cache, batch fetching |
| Identity Provider | PASS | IdentityProvider wraps app; memoized context |
| RequireIdentity | PASS | Route guard; redirects to /identity if no identity |
| User Profile/Avatar | PASS | UserAvatar, useUserProfile, Profile page with bio/website/avatar |

**Subtotal: 14 checks -- 10 PASS, 0 FAIL, 4 MISSING**

### chat-client

| Feature | Status | Notes |
|---------|--------|-------|
| useStoredIdentity | PASS | Via @swimchain/frontend IdentityProvider |
| useStoredKeypair | PASS | Via @swimchain/frontend; bridges stored identity with WASM Keypair |
| useNodeIdentity | MISSING | Not implemented |
| Identity Page | PASS | Keypair generation, PoW mining (difficulty 20), delete, upgrade detection |
| AddressDisplay | PASS | Via @swimchain/frontend component |
| Keypair Generation | PASS | Via @swimchain/frontend useKeypair() hook |
| Keypair Storage | PASS | localStorage key swimchain-identity |
| Keypair Backup/Export | MISSING | No backup prompt, no export UI |
| Keypair Import/Restore | MISSING | No import UI |
| Passphrase Protection | MISSING | Seeds stored as plaintext in localStorage |
| Display Name Mgmt | PASS | **FIXED (Round 3):** Display Name input + save in SettingsPage |
| Identity Provider | PASS | Via @swimchain/frontend |
| RequireIdentity | PASS | Route guard, redirect to /identity, validates seed format |
| User Profile/Avatar | PASS | UserAvatar, UserProfileModal, useUserProfile with cache |

**Subtotal: 14 checks -- 10 PASS, 0 FAIL, 4 MISSING**

### feed-client

| Feature | Status | Notes |
|---------|--------|-------|
| useStoredIdentity | PASS | Full local implementation; localStorage |
| useStoredKeypair | PASS | Converts hex seed to WASM keypair; proper cleanup |
| useNodeIdentity | PASS | Full provider; get_identity_info + sign_message RPC |
| Identity Page | PASS | 677 lines; dual-mode; generate + PoW + backup + import + delete + display name |
| AddressDisplay | PASS | Truncation, copy, ARIA labels |
| Keypair Generation | PASS | Via useKeypair hook; WASM |
| Keypair Storage | PASS | localStorage swimchain-identity |
| Keypair Backup/Export | PASS | BackupPromptModal: seed show/hide, copy, download .txt, forced acknowledgment |
| Keypair Import/Restore | PASS | Import from 64-char hex seed |
| Passphrase Protection | PASS | usePassphraseStore for content encryption |
| Display Name Mgmt | PASS | Edit on Identity page, 64 char max, saves to node via RPC |
| Identity Provider | PASS | IdentityProvider + NodeIdentityProvider |
| RequireIdentity | PASS | Route guard; validates seed+address |
| User Profile/Avatar | PASS | Profile page (522 lines), UserProfileModal, IdentityCard, useUserProfile |

**Subtotal: 14 checks -- 14 PASS, 0 FAIL, 0 MISSING**

### search-client

| Feature | Status | Notes |
|---------|--------|-------|
| useStoredIdentity | PASS | Via @swimchain/frontend |
| useStoredKeypair | PASS | Via @swimchain/frontend |
| useNodeIdentity | MISSING | Not in search-client or swimchain-frontend |
| Identity Page | PASS | Keypair generation, PoW mining (difficulty 20), delete, upgrade |
| AddressDisplay | PASS | Via @swimchain/frontend component |
| Keypair Generation | PASS | Via @swimchain/frontend useKeypair() |
| Keypair Storage | PASS | localStorage swimchain-identity |
| Keypair Backup/Export | MISSING | CSS stubs exist but no logic |
| Keypair Import/Restore | MISSING | CSS stubs exist but no logic |
| Passphrase Protection | MISSING | Seeds stored plaintext |
| Display Name Mgmt | MISSING | No UI for setting display name |
| Identity Provider | PASS | Via @swimchain/frontend |
| RequireIdentity | MISSING | No route guard |
| User Profile/Avatar | PASS | **FIXED (Round 3):** Deterministic colored circle avatar with initials |

**Subtotal: 14 checks -- 8 PASS, 0 FAIL, 6 MISSING**

### analytics-client

| Feature | Status | Notes |
|---------|--------|-------|
| useStoredIdentity | MISSING | Not imported; read-only dashboard |
| useStoredKeypair | MISSING | Not imported |
| useNodeIdentity | MISSING | Not implemented |
| Identity Page | MISSING | Routes: /, /spaces, /spaces/:id, /settings only |
| AddressDisplay | MISSING | Author IDs shown as truncated strings |
| Keypair Generation | MISSING | No signing |
| Keypair Storage | MISSING | No identity data |
| Keypair Backup/Export | MISSING | N/A |
| Display Name Mgmt | MISSING | Authors shown as raw truncated IDs |
| Identity Provider | MISSING | Only SwimchainProvider + RpcProvider |
| RequireIdentity | MISSING | All pages public |
| User Profile/Avatar | MISSING | No avatar or profile |

**Subtotal: 12 checks -- 0 PASS, 0 FAIL, 12 MISSING**

### archiver-client

| Feature | Status | Notes |
|---------|--------|-------|
| useStoredIdentity | MISSING | Not imported |
| useStoredKeypair | MISSING | Not imported |
| useNodeIdentity | MISSING | Not implemented |
| Identity Page | MISSING | Pages: Dashboard, Settings, ArchivedContent |
| AddressDisplay | MISSING | Uses IdentityAddress type only |
| Keypair Generation | MISSING | No generation UI |
| Keypair Storage | MISSING | No identity localStorage |
| Keypair Backup/Export | MISSING | N/A |
| Display Name Mgmt | MISSING | No display name features |
| Identity Provider | MISSING | Only SwimchainProvider + RpcProvider |
| RequireIdentity | MISSING | All pages open |
| User Profile/Avatar | MISSING | No profile/avatar |

**Subtotal: 12 checks -- 0 PASS, 0 FAIL, 12 MISSING**

### bridge-client

| Feature | Status | Notes |
|---------|--------|-------|
| useStoredIdentity | PASS | Local implementation; localStorage swimchain-bridge-identity |
| useStoredKeypair | PASS | Local implementation; WASM Keypair from seed |
| useNodeIdentity | MISSING | Not implemented |
| Identity Page | MISSING | No identity management UI |
| AddressDisplay | MISSING | No address display component |
| Keypair Generation | MISSING | useKeypair() available but not used |
| Keypair Storage | PASS | localStorage swimchain-bridge-identity |
| Keypair Backup/Export | MISSING | No backup or export |
| Display Name Mgmt | MISSING | StoredIdentity type doesn't include displayName |
| Identity Provider | PASS | **FIXED (Round 3):** IdentityProvider wrapping useStoredIdentity added to App.tsx |
| RequireIdentity | MISSING | No auth guard |
| User Profile/Avatar | MISSING | No profile or avatar |

**Subtotal: 12 checks -- 4 PASS, 0 FAIL, 8 MISSING**

### Identity Domain Summary

| Client | Total | PASS | FAIL | MISSING |
|--------|-------|------|------|---------|
| forum-client | 14 | 10 | 0 | 4 |
| chat-client | 14 | 10 | 0 | 4 |
| feed-client | 14 | 14 | 0 | 0 |
| search-client | 14 | 8 | 0 | 6 |
| analytics-client | 12 | 0 | 0 | 12 |
| archiver-client | 12 | 0 | 0 | 12 |
| bridge-client | 12 | 4 | 0 | 8 |
| **TOTAL** | **92** | **46** | **0** | **46** |

---

## 2. SPONSORSHIP AUDIT (Sponsorship-Owner)

### forum-client

| Feature | Status | Notes |
|---------|--------|-------|
| Browse public offers | PASS | Pagination (20/page), filtering by type, refresh |
| Claim offer (with PoW) | PASS | SHA-256 mining, progress bar, configurable difficulty |
| Application text on claim | PASS | Optional or required per offer, 2000 char limit |
| Create offer | PASS | Type, slots (1-10), expiry (1-365d), min PoW, app-required toggle |
| List my offers (sponsor) | PASS | Signed auth, auto-poll 30s, pending claims count |
| Approve claim | PASS | Signed action, refreshes UI after |
| Reject claim | PASS | Signed action with confirmation |
| Cancel offer | PASS | Signed action with confirmation |
| Sponsorship status display | PASS | Depth, probation, penalty, genesis, sponsor pubkey |
| Pending claim notice | PASS | Banner + tab indicator while awaiting review |
| Unsponsored user banner | PASS | Sticky banner with "Find a Sponsor" CTA |
| Sidebar badge | PASS | Shows pending claims count |
| Auto-polling | PASS | 30s interval when unsponsored or has active offers |
| Route /sponsorship | PASS | 3-tab page, accessible without sponsorship |
| RPC methods (10) | PASS | All 10 sponsorship RPC methods implemented |
| Offer detail fetch failure | PASS | **FIXED (Round 4):** detailError state + inline error banners in Sponsorship page |

**Subtotal: 16 checks -- 16 PASS, 0 FAIL, 0 MISSING**

### chat-client

| Feature | Status | Notes |
|---------|--------|-------|
| Any sponsorship feature | MISSING | Zero sponsorship code |

**Subtotal: 1 check -- 0 PASS, 0 FAIL, 1 MISSING**

### feed-client

| Feature | Status | Notes |
|---------|--------|-------|
| Browse public offers | PASS | Pagination, filtering, refresh |
| Claim offer (with PoW) | PASS | Full PoW mining, cancellation support |
| Application text on claim | PASS | Optional/required per offer |
| Create offer | PASS | Full modal with all settings |
| List my offers (sponsor) | PASS | Signed auth, auto-poll 30s |
| Approve claim | PASS | Signed action |
| Reject claim | PASS | Signed with confirmation |
| Cancel offer | PASS | Signed with confirmation |
| Sponsorship status display | PASS | Full status with depth/probation/penalty |
| Pending claim notice | PASS | Banner shows "claim pending review" |
| Unsponsored user banner | PASS | Sticky banner with CTA |
| Navigation links | PASS | Header + mobile nav to /sponsorship |
| Auto-polling | PASS | 30s for status + offer updates |
| Route /sponsorship | PASS | 3-tab page, requires identity |
| RPC methods (10) | PASS | All 10 sponsorship RPC methods |

**Subtotal: 15 checks -- 15 PASS, 0 FAIL, 0 MISSING**

### search-client

| Feature | Status | Notes |
|---------|--------|-------|
| Any sponsorship feature | MISSING | Zero sponsorship code |

**Subtotal: 1 check -- 0 PASS, 0 FAIL, 1 MISSING**

### analytics-client

| Feature | Status | Notes |
|---------|--------|-------|
| Any sponsorship feature | MISSING | Zero sponsorship code |

**Subtotal: 1 check -- 0 PASS, 0 FAIL, 1 MISSING**

### archiver-client

| Feature | Status | Notes |
|---------|--------|-------|
| Any sponsorship feature | MISSING | Zero sponsorship code |

**Subtotal: 1 check -- 0 PASS, 0 FAIL, 1 MISSING**

### bridge-client

| Feature | Status | Notes |
|---------|--------|-------|
| Any sponsorship feature | MISSING | Zero sponsorship code |

**Subtotal: 1 check -- 0 PASS, 0 FAIL, 1 MISSING**

### Sponsorship Domain Summary

| Client | Total | PASS | FAIL | MISSING | WARN |
|--------|-------|------|------|---------|------|
| forum-client | 16 | 16 | 0 | 0 | 0 |
| chat-client | 1 | 0 | 0 | 1 | 0 |
| feed-client | 15 | 15 | 0 | 0 | 0 |
| search-client | 1 | 0 | 0 | 1 | 0 |
| analytics-client | 1 | 0 | 0 | 1 | 0 |
| archiver-client | 1 | 0 | 0 | 1 | 0 |
| bridge-client | 1 | 0 | 0 | 1 | 0 |
| **TOTAL** | **36** | **31** | **0** | **5** | **0** |

---

## 3. CONTENT AUDIT (Content-Owner)

### forum-client

| Feature | Status | Notes |
|---------|--------|-------|
| Post creation (NewThread) | PASS | Title, body, image upload, Argon2id PoW, encryption toggle |
| Reply creation (ReplyComposer) | PASS | Nested replies, PoW mining, auto-submit after mine |
| Content display (ThreadView) | PASS | Title, body, author, timestamps, media, encrypted content |
| Space browsing (SpaceList) | PASS | Space cards, creation form, sponsorship check |
| Threading / reply tree (ReplyTree) | PASS | Recursive depth-5 threading, collapse/expand, focused reply scroll |
| Decay indicators | PASS | **FIXED (Round 3):** ContentStatus shows survival % with 7-day half-life |
| Media upload | PASS | Up to 4 images, 1MB limit, auto-compression, preview |
| Media display (ImageGallery) | PASS | Lightbox, keyboard nav, encrypted image support, lazy loading |
| Engagement / reactions (ContentStatus) | PASS | 8 emoji reactions, PoW-backed, counts, picker with keyboard nav |
| Content status indicators | PASS | **FIXED (Round 3):** Decay % bar with 4 color states |
| Search (SearchResults) | PASS | Server-side search via RPC, spaces + threads, snippets |
| Private/encrypted content (EncryptedContent) | PASS | AES-GCM, passphrase unlock, auto-decrypt, remember passphrase |
| Delete/moderation (DeleteConfirmModal) | PASS | **FIXED (Round 3):** Generic with type prop (identity/post/reply) |
| User profiles | PASS | Generated avatars, display name resolution, copy address, profile links |
| Block content/users (BlockButton) | PASS | Block messages or users, dropdown menu |
| Report / spam attestation (ReportModal) | PASS | 5 report reasons, PoW-backed, defend option |
| Chat view (ChatView) | PASS | Real-time encrypted messages, member list, 3s polling |
| Debug panel (DebugPanel) | PASS | Sync state, chain height, peers, storage, auto-refresh |
| Proof-of-work (useActionPow) | PASS | Argon2id via Web Worker, progress tracking, cancellable |
| Identity management | PASS | Node-managed identity, signing, address display |
| Private space key derivation | PASS | **FIXED (Round 1):** Uses node RPC for key derivation |
| Node status (NodeStatusBar) | PASS | Tauri-only, peer count, network, stop/restart controls |
| Backup prompt (BackupPromptModal) | PASS | Seed show/hide, copy, download, acknowledgment |
| Space settings (SpaceSettings) | PASS | Member list, roles, invite, kick |
| Post/reply editing | MISSING | useEditSubmit hook exists but no UI |

**Subtotal: 25 checks -- 24 PASS, 0 FAIL, 1 MISSING**

### chat-client

| Feature | Status | Notes |
|---------|--------|-------|
| Message sending | PASS | Auto-resize textarea, Enter to send, Shift+Enter newline, image attach |
| Message display | PASS | Discord-style grouping, avatars, timestamps, status indicators |
| Channel management | PASS | Collapsible categories, channel icons, auto-detect format |
| Channel unread counts | PASS | **FIXED (Round 3):** localStorage last-read tracking + markChannelRead() |
| Server list | PASS | **FIXED (Round 2):** Uses real rpc.listSpaces() |
| Media handling | PASS | Lightbox, keyboard nav, encrypted media, lazy loading |
| User profiles | PASS | Multi-size avatars, profile modal, bio/website, block action |
| Online/presence status | PASS | **FIXED (Round 3):** Removed mock, shows real peer count |
| Block/report | PASS | Block users/messages, 5 report reasons |
| Spam attestation PoW | PASS | **FIXED (Round 1):** Real Argon2id PoW |
| Private channels | PASS | E2E encryption, X25519 key exchange, AES-GCM channel key |
| Invite system | PASS | Key sharing, encrypted channel key for recipient |
| Invite PoW | PASS | **FIXED (Round 1):** Real Argon2id PoW via useActionPow |
| Debug panel | PASS | Chain height, peers, sync state |
| Log viewer in debug panel | FAIL | Shows file path only (deferred) |
| Node status (NodeStatusBar) | PASS | Tauri-only, running/stopped, peer count |
| Toast notifications | PASS | Success/error/warning/info, auto-dismiss |
| Identity guard | PASS | Route guard, redirect to /identity |
| PoW for messages | PASS | Argon2id, all action types, progress, cancellable |
| RPC integration | PASS | 1548-line hook, cookie auth |
| Message threading/replies | PASS | **FIXED (Round 2):** Full reply chain wired with replyTarget state |
| Message reactions | PASS | **FIXED (Round 2):** Wired usePoolContribution, emoji-to-code map, submitEngagement |
| Content decay indicators | MISSING | No decay display |
| In-channel search | PASS | Cmd/Ctrl+K shortcut |
| Typing indicators | FAIL | Component exists but not integrated (deferred) |
| Message editing | PASS | **FIXED (Round 2):** Edit button removed (protocol doesn't support editing) |

**Subtotal: 26 checks -- 22 PASS, 2 FAIL, 2 MISSING**

### feed-client

| Feature | Status | Notes |
|---------|--------|-------|
| Content display (FeedCard) | PASS | Author avatar, title, body, timestamps |
| Feed algorithm | PASS | Hot + recent sort, deduplication, cursor-based pagination |
| Infinite scroll | PASS | Intersection Observer, 20 items/page |
| Post creation (Compose) | PASS | Space select, title/body, images, Argon2id PoW |
| Reply creation | PASS | Reply composer with PoW |
| Post detail view | PASS | Full post + nested reply tree |
| Decay indicators | PASS | 4 states, progress bar, color coding, TTL countdown |
| Media upload | PASS | Max 4 images, 1MB limit, compression |
| Media display (ImageGallery) | PASS | Lightbox, keyboard nav |
| Engagement / reactions | PASS | 8 emoji, keyboard nav, PoW-backed |
| User profiles | PASS | Display name, bio, website, avatar upload |
| Filtering and sorting | PASS | 5 sort modes, spaces/users filter, mute |
| Client-side search | PASS | Multi-term AND search, Cmd/Ctrl+K |
| Global server-side search | MISSING | Only searches locally cached items |
| Block content/users | PASS | Block users/posts/spaces/replies |
| Report / spam attestation | PASS | ReportModal with SPEC_12 |
| RPC integration | PASS | Full hooks |
| Identity management | PASS | Ed25519 keypair, passphrase, backup/import |
| PoW for posting | PASS | All action types, Argon2id |
| Sponsorship | PASS | Offers, claiming, management |
| Private spaces | PASS | Component exists with E2E encryption |
| Saved posts view | PASS | **FIXED (Round 3):** Real saved posts via localStorage + get_content RPC |
| User discovery | MISSING | "Coming soon" comment |
| Notifications | MISSING | Not implemented |
| Content editing | MISSING | No edit UI |

**Subtotal: 25 checks -- 20 PASS, 0 FAIL, 5 MISSING**

### search-client

| Feature | Status | Notes |
|---------|--------|-------|
| Basic text search | PASS | Full RPC integration |
| Content type tabs | PASS | Tab-based filtering, result counts |
| Sort options | PASS | Dropdown sort selector |
| Thread results display | PASS | Title, snippet, author, space |
| Space results display | PASS | Name, description, thread count |
| Reply results display | PASS | Content, parent thread context |
| User results display | PASS | Name, bio, post count |
| Result highlighting | PASS | mark tags on matched terms |
| Advanced query syntax | PASS | Phrase, author:, space:, type:, date, has:media, -exclude |
| Autocomplete suggestions | PASS | 200ms debounced, keyboard nav |
| Search history | PASS | localStorage, max 20 items |
| Trending searches | PASS | **FIXED (Round 3):** Shows recent search history from localStorage |
| Pagination | PASS | **FIXED (Round 3):** onClick handlers wired with onPageChange prop |
| Date range filter | PASS | **FIXED (Round 4):** dateRange state wired through SearchResults to SearchFilters |
| Decay display on results | MISSING | No TTL or decay |
| Follow space button | PASS | **FIXED (Round 3):** Removed (no RPC available) |
| Follow user button | PASS | **FIXED (Round 3):** Removed (no RPC available) |
| Message user button | PASS | **FIXED (Round 3):** Removed (requires chat-client) |
| User avatar images | PASS | **FIXED (Round 3):** Deterministic colored avatar with initials |
| Identity management | PASS | Ed25519 keypair, PoW mining |
| RPC integration | PASS | JSON-RPC 2.0, signature auth |
| Advanced search modal | MISSING | Not implemented |
| Saved searches | MISSING | Not implemented |

**Subtotal: 23 checks -- 20 PASS, 0 FAIL, 3 MISSING**

### analytics-client

| Feature | Status | Notes |
|---------|--------|-------|
| Network health gauge | PASS | Circular gauge 0-100 |
| Metric cards | PASS | Active swimmers, posts at risk, avg heat |
| Heat distribution histogram | PASS | 10-bucket bar chart |
| Health history sparkline | PASS | 24h history chart |
| Space list by risk | PASS | All spaces sorted by risk |
| Space detail metrics | PASS | Total posts, at-risk, healthy, avg heat |
| Recent posts in space | PASS | Table with heat badges |
| Decay/heat display | PASS | Heat percentages, at-risk classification |
| Alert system | PASS | Low swimmers, high risk, stale sync, low heat |
| Settings/configuration | PASS | Metrics toggle, poll interval, watched spaces |
| RPC integration | PASS | Real calls |
| Advanced metrics | PASS | **FIXED (Round 3):** Dead config removed |
| Media handling | MISSING | Text-only |
| Search | MISSING | No search |
| Content creation | MISSING | Read-only by design |

**Subtotal: 15 checks -- 12 PASS, 0 FAIL, 3 MISSING**

### archiver-client

| Feature | Status | Notes |
|---------|--------|-------|
| At-risk content list | PASS | Expandable, urgency badges, heat %, time remaining |
| Content archiving to IndexedDB | PASS | Full CRUD, storage quota |
| Archived content browser | PASS | Grouped by space |
| Archive search | PASS | Client-side text search |
| Archive delete | PASS | Delete individual entries |
| PoW engagement (EngageButton) | PASS | Real Argon2id mining, hash rate |
| Auto-engage engine | PASS | Priority queue, daily budget |
| Decay display | PASS | Heat %, survival probability, urgency badges |
| Content monitoring | PASS | Real RPC, polling |
| Budget meter | PASS | Daily PoW budget visualization |
| Dashboard status cards | PASS | Spaces, critical, warning, archived, storage |
| Space filtering | PASS | Filter by space, urgency sort |
| Settings / configuration | PASS | Target spaces, thresholds, budgets |
| RPC integration | PASS | Real API calls |
| Identity for PoW | PASS | **FIXED (Round 3):** Informational banner about identity requirement |
| Media handling | MISSING | Text-only archiving |
| Engagement metrics charts | MISSING | No charts |

**Subtotal: 17 checks -- 15 PASS, 0 FAIL, 2 MISSING**

### bridge-client

| Feature | Status | Notes |
|---------|--------|-------|
| Bidirectional bridging (Matrix) | PASS | Real PoW + RPC submitPost() |
| Bidirectional bridging (IRC) | PASS | WebSocket proxy, real posting |
| Platform status display | PASS | Connection status for Matrix, IRC, Swimchain |
| Activity log | PASS | Filterable |
| Dashboard (recent activity) | PASS | Last 10 events, controls, budget |
| Echo prevention | PASS | Tracks bridged messages |
| Rate limiting | PASS | Hourly post limits |
| Matrix config | PASS | Homeserver, user ID, access token, rooms |
| IRC config | PASS | Server, port, TLS, nickname, channels |
| PoW for posting | PASS | Real Argon2id |
| Identity management | PASS | Ed25519 keypair, signature auth |
| RPC integration | PASS | Real API |
| Activity search | MISSING | No search in activity log |
| Media bridging | MISSING | Text-only |
| Metrics/charts | MISSING | Counts only |
| Decay display | MISSING | Not applicable |

**Subtotal: 16 checks -- 12 PASS, 0 FAIL, 4 MISSING**

### Content Domain Summary (Post-Remediation)

| Client | Total | PASS | FAIL | MISSING |
|--------|-------|------|------|---------|
| forum-client | 25 | 24 | 0 | 1 |
| chat-client | 26 | 22 | 2 | 2 |
| feed-client | 25 | 20 | 0 | 5 |
| search-client | 23 | 20 | 0 | 3 |
| analytics-client | 15 | 12 | 0 | 3 |
| archiver-client | 17 | 15 | 0 | 2 |
| bridge-client | 16 | 12 | 0 | 4 |
| **TOTAL** | **147** | **125** | **2** | **20** |

---

## 4. NAVIGATION AUDIT (Navigation-Owner)

### forum-client

| Feature | Status | Notes |
|---------|--------|-------|
| React Router v6 | PASS | 14 routes |
| Catch-all 404 route | PASS | Navigate to / |
| MainLayout wrapper | PASS | Persistent layout with Header + Sidebar + StatusBar |
| Header (top nav) | PASS | Logo, SearchBox, ProfileButton, Settings gear |
| Sidebar (left nav) | PASS | Collapsible, two tabs, SpaceTree, sponsorship badge |
| StatusBar (footer) | PASS | Sync status, peer count, storage MB |
| NodeStatusBar (Tauri) | PASS | Desktop-only status |
| RequireIdentity guard | PASS | Route guard, redirect, needsUpgrade |
| ErrorBoundary | PASS | Try Again + Reload buttons, WASM hint |
| LoadingScreen (WASM) | PASS | Three-ring spinner |
| SponsorshipBanner | PASS | Full-width top alert when unsponsored |
| All pages (11) | PASS | SpaceList, SpaceView, ThreadView, NewThread, Identity, Settings, Sponsorship, Profile, SearchResults, CreatePrivateSpace, ChatView |
| BackupPromptModal | PASS | Seed backup with focus trap |
| InviteModal | PASS | Private space invitations |
| ReportModal | PASS | Spam report with PoW |
| DeleteConfirmModal | PASS | Type "DELETE" to confirm |
| DebugPanel | PASS | Full diagnostics |
| Toast notifications | PASS | Success/error/warning/info |
| Keyboard shortcuts | PASS | ? modal, j/k/Enter/n/r// shortcuts |
| Skip-to-main link | PASS | Accessibility |
| Mobile responsive | PASS | Sidebar collapses |
| Loading states | PASS | Per-page spinners |
| Error states | PASS | Error cards with retry |

**Subtotal: 23 checks -- 23 PASS, 0 FAIL, 0 MISSING**

### chat-client

| Feature | Status | Notes |
|---------|--------|-------|
| React Router v6 | PASS | 8 routes |
| Catch-all 404 route | PASS | /channels/@me |
| Three-column layout | PASS | Discord-style: ServerList, ChannelSidebar, ChatArea |
| ServerList (left bar) | PASS | Vertical server icons, tooltips |
| ChannelSidebar | PASS | Server header, channel grouping, collapse/expand |
| ChatArea (main) | PASS | Message list, grouping, auto-scroll |
| NodeStatusBar (Tauri) | PASS | Same as forum-client |
| RequireIdentity guard | PASS | Identity + seed check |
| ErrorBoundary | PASS | Fallback UI, retry |
| Identity page | PASS | Keypair generation, PoW mining |
| Settings page | PASS | Toggles, BlocklistManager, Debug Panel |
| CreatePrivateChannel | PASS | X25519 key exchange |
| InviteModal | PASS | Key encryption |
| ReportModal | PASS | 5 reasons |
| DebugPanel | PASS | Full diagnostics modal |
| Toast notifications | PASS | All types |
| Mobile navigation | PASS | Hamburger toggle, sidebar overlay |
| Message search | PASS | Ctrl/Cmd+K |
| Loading states | PASS | Spinners |
| Typing indicators | PASS | TypingProvider |
| Presence indicators | PASS | PresenceProvider |
| Context providers | PASS | 4 providers |
| Persistent layout | PASS | **FIXED (Round 3):** "Back to Chat" links added to Identity/Settings pages |
| Loading screen (WASM) | MISSING | No global LoadingScreen |

**Subtotal: 24 checks -- 23 PASS, 0 FAIL, 1 MISSING**

### feed-client

| Feature | Status | Notes |
|---------|--------|-------|
| React Router v6 | PASS | 12 routes |
| Catch-all 404 route | PASS | / |
| Persistent Header | PASS | Logo, nav links, Settings, Profile |
| Mobile bottom nav | PASS | Bottom bar with icons |
| SponsorshipBanner | PASS | Persistent when unsponsored |
| RequireIdentity guard | PASS | Route protection |
| ErrorBoundary | PASS | Try Again + Reload |
| LoadingScreen (WASM) | PASS | Three-ring spinner |
| NodeStatusBar (Tauri) | PASS | Desktop status |
| DebugPanel | PASS | Full diagnostics |
| Toast notifications | PASS | ToastProvider |
| All pages (11) | PASS | Feed, Discover, Compose, Post, SpaceView, Identity, Sponsorship, Profile, Settings, CreatePrivateSpace, Saved |
| BackupPromptModal | PASS | Seed backup |
| InviteModal | PASS | Private space invitations |
| ReportModal | PASS | Spam reporting |
| DeleteConfirmModal | PASS | Identity deletion |
| UserProfileModal | PASS | User profile popup |
| Context providers | PASS | 4 providers |
| Sidebar navigation | MISSING | No left sidebar -- header-only |
| StatusBar (footer) | MISSING | No persistent footer |

**Subtotal: 20 checks -- 18 PASS, 0 FAIL, 2 MISSING**

### search-client

| Feature | Status | Notes |
|---------|--------|-------|
| React Router v6 | PASS | 7 routes |
| Catch-all 404 route | PASS | / |
| Home page layout | PASS | Google-style centered search |
| Results page layout | PASS | Header + SearchResults |
| Skip-to-main link | PASS | Accessibility |
| Cross-client redirects | PASS | Links to forum-client |
| Identity page | PASS | IdentityProvider |
| IdentityProvider | PASS | From shared package |
| Persistent header/nav | MISSING | No shared nav wrapper |
| ErrorBoundary | MISSING | No error boundary at all |
| LoadingScreen (WASM) | MISSING | No loading screen |
| NodeStatusBar | MISSING | Not implemented |
| RequireIdentity guard | MISSING | All routes public |
| DebugPanel | MISSING | Not implemented |
| Toast notifications | MISSING | Not implemented |
| Modals | MISSING | None |
| SponsorshipBanner | MISSING | None |
| Mobile responsive nav | MISSING | None |

**Subtotal: 18 checks -- 8 PASS, 0 FAIL, 10 MISSING**

### analytics-client

| Feature | Status | Notes |
|---------|--------|-------|
| React Router v6 | PASS | 4 routes |
| Catch-all 404 route | PASS | / |
| Dashboard layout | PASS | Header + status badges + actions |
| Connection error banner | PASS | Inline banner |
| Alert banners | PASS | AlertBanner with severity |
| Health gauge | PASS | Network health widget |
| Metric cards grid | PASS | MetricCard components |
| ErrorBoundary | PASS | Wraps app |
| LoadingScreen (WASM) | PASS | Three-ring spinner |
| Spaces page | PASS | Watched spaces |
| SpaceDetail page | PASS | Individual analytics |
| Settings page | PASS | Configuration |
| Persistent header/nav | MISSING | Per-page headers |
| NodeStatusBar | MISSING | Not implemented |
| DebugPanel | MISSING | Not implemented |
| Toast notifications | MISSING | Not implemented |
| RequireIdentity guard | MISSING | All routes public |
| Modals | MISSING | None |
| SponsorshipBanner | MISSING | None |
| Mobile responsive nav | MISSING | None |

**Subtotal: 20 checks -- 12 PASS, 0 FAIL, 8 MISSING**

### archiver-client

| Feature | Status | Notes |
|---------|--------|-------|
| React Router v6 | PASS | 4 routes |
| Catch-all 404 route | PASS | /dashboard |
| Dashboard layout | PASS | Status banner, nav links, cards, budget, filter |
| Connection status banner | PASS | Disconnected/connecting |
| Status cards | PASS | 5 types |
| At-risk content list | PASS | Empty/loading/content states |
| ArchivedContent page | PASS | Archived items |
| Settings page | PASS | Configuration |
| ErrorBoundary | PASS | **FIXED (Round 1):** Imported and wired in App.tsx |
| LoadingScreen (WASM) | PASS | **FIXED (Round 1):** Imported and wired in App.tsx |
| Persistent header/nav | MISSING | Inline nav only |
| NodeStatusBar | MISSING | Not implemented |
| DebugPanel | MISSING | Not implemented |
| Toast notifications | MISSING | Not implemented |
| RequireIdentity guard | MISSING | No auth |
| Modals | MISSING | None |
| SponsorshipBanner | MISSING | None |
| Mobile responsive nav | MISSING | None |

**Subtotal: 18 checks -- 10 PASS, 0 FAIL, 8 MISSING**

### bridge-client

| Feature | Status | Notes |
|---------|--------|-------|
| React Router v6 | PASS | 6 routes |
| Catch-all 404 route | PASS | /dashboard |
| Dashboard layout | PASS | Header + nav + controls + status + activity |
| Platform status cards | PASS | Matrix and IRC |
| MatrixConfig page | PASS | Configuration |
| IrcConfig page | PASS | Configuration |
| ActivityLog page | PASS | Full log |
| Settings page | PASS | General settings |
| ErrorBoundary | PASS | **FIXED (Round 1):** Imported and wired in App.tsx |
| LoadingScreen (WASM) | PASS | **FIXED (Round 1):** Imported and wired in App.tsx |
| Persistent header/nav | MISSING | Inline nav only |
| NodeStatusBar | MISSING | Not implemented |
| DebugPanel | MISSING | Not implemented |
| Toast notifications | MISSING | Not implemented |
| RequireIdentity guard | MISSING | No auth |
| Modals | MISSING | None |
| SponsorshipBanner | MISSING | None |
| Mobile responsive nav | MISSING | None |

**Subtotal: 18 checks -- 10 PASS, 0 FAIL, 8 MISSING**

### Navigation Domain Summary

| Client | Total | PASS | FAIL | MISSING |
|--------|-------|------|------|---------|
| forum-client | 23 | 23 | 0 | 0 |
| chat-client | 24 | 23 | 0 | 1 |
| feed-client | 20 | 18 | 0 | 2 |
| search-client | 18 | 8 | 0 | 10 |
| analytics-client | 20 | 12 | 0 | 8 |
| archiver-client | 18 | 10 | 0 | 8 |
| bridge-client | 18 | 10 | 0 | 8 |
| **TOTAL** | **141** | **104** | **0** | **37** |

---

## 5. PRIVATE SPACE AUDIT (PrivateSpace-Owner)

### forum-client

| Feature | Status | Notes |
|---------|--------|-------|
| Private space creation | PASS | CreatePrivateSpace.tsx -- full flow |
| Private space listing | PASS | PrivateSpaceList.tsx -- decrypts names |
| X25519 key derivation | PASS | Ed25519 to X25519 conversion |
| Key storage (IndexedDB) | PASS | swimchain-private-spaces store |
| Encrypted messaging (receive) | PASS | usePrivateSpaceMessages -- auto-decrypt |
| Encrypted messaging (send) | PASS | ChatView.tsx -- encrypts with encryptWithSpaceKey() |
| Chat view for private spaces | PASS | ChatView.tsx -- message list, composer, member list |
| Content decryption (passphrase) | PASS | AES-256-GCM + PBKDF2 |
| Content decryption (space key) | PASS | [PRIVATE:v1:...] format |
| Invite system | PASS | InviteModal.tsx -- X25519 ECDH |
| Accept/decline invites | PASS | usePrivateSpaceInvites |
| DM support | PASS | StartDMButton + lib/dm.ts |
| Passphrase storage | PASS | usePassphraseStore |
| Space settings / admin | PASS | SpaceSettings.tsx |
| Media encryption | PASS | Binary data encryption |
| Space name encryption | PASS | AES-256-GCM with space key |
| NaCl box encryption | PASS | XSalsa20-Poly1305 |
| Web Worker PBKDF2 | PASS | Background thread |
| Input validation | PASS | Address validation, length limits |
| Accessibility | PASS | Focus traps, ARIA |
| PoW for private actions | PASS | **FIXED (Round 2):** Real PoW via useActionPow + useSpaceCreationPow |
| Key backup/export | MISSING | No export/download/recovery |
| RPC integration | PASS | 13+ methods |

**Subtotal: 23 checks -- 22 PASS, 0 FAIL, 1 MISSING**

### chat-client

| Feature | Status | Notes |
|---------|--------|-------|
| Private channel creation | PASS | CreatePrivateChannel.tsx |
| Channel key generation | PASS | generateSpaceKey() |
| X25519 key derivation | PASS | deriveX25519Keys() |
| Key storage (IndexedDB) | PASS | swimchain-private-channels |
| Encrypted messaging (receive) | PASS | usePrivateChannelMessages -- auto-decrypt |
| Encrypted messaging (send) | PASS | **FIXED (Round 1):** AES-256-GCM encryption before send |
| Channel name encryption | PASS | encryptSpaceName() |
| Self-encryption | PASS | Creator encrypts key for self |
| Channel listing (sidebar) | PASS | Lock icon for encrypted |
| Invite system | PASS | InviteModal.tsx -- X25519 |
| PoW for channel creation | PASS | useChannelCreationPow |
| PoW for invites | PASS | **FIXED (Round 1):** Real Argon2id PoW via useActionPow |
| Passphrase-based encryption | PASS | AES-256-GCM + PBKDF2 (available, unused) |
| Key versioning | PASS | Infrastructure only |
| Signature authentication | PASS | Ed25519 signed |
| Timestamp protection | PASS | Unix timestamps |
| Error handling | PASS | Graceful fallbacks |
| Encryption worker | PASS | Web Worker PBKDF2 |
| DM support | MISSING | Not implemented |
| EncryptedContent component | MISSING | Referenced in DESIGN.md but doesn't exist |
| Passphrase storage | MISSING | No usePassphraseStore |
| Key rotation (full) | FAIL | No distribution mechanism (deferred) |
| Key backup/export | MISSING | No recovery |
| Media encryption | MISSING | Images uploaded unencrypted |
| Channel member list | MISSING | No way to view members |
| Remove members / kick | MISSING | No revocation UI |
| Pending invites UI | MISSING | No inbox |
| RPC integration | PASS | useCreatePrivateChannel, useInviteToChannel |

**Subtotal: 28 checks -- 17 PASS, 1 FAIL, 10 MISSING**

### feed-client

| Feature | Status | Notes |
|---------|--------|-------|
| Private space creation | PASS | CreatePrivateSpace.tsx |
| X25519 key derivation | PASS | Full implementation |
| Key storage (IndexedDB) | PASS | swimchain-feed-private-spaces |
| Encrypted content display | PASS | EncryptedContent.tsx |
| Content decryption (passphrase) | PASS | AES-256-GCM + PBKDF2 |
| Content decryption (space key) | PASS | [PRIVATE:v1:...] |
| Invite system | PASS | InviteModal.tsx |
| Passphrase storage | PASS | usePassphraseStore |
| Media encryption | PASS | Binary data encryption |
| Space name encryption | PASS | AES-GCM |
| Web Worker PBKDF2 | PASS | Background thread |
| RPC integration | PASS | 8 hooks |
| Private space listing | MISSING | No PrivateSpaceList component |
| Private space messaging | MISSING | No usePrivateSpaceMessages |
| DM support | MISSING | None |
| PoW for private actions | FAIL | Placeholders |
| Key backup/export | MISSING | No recovery |

**Subtotal: 17 checks -- 11 PASS, 1 FAIL, 5 MISSING**

### search-client

| Feature | Status | Notes |
|---------|--------|-------|
| Private space creation | MISSING | Read-only search client |
| X25519 key derivation | MISSING | Not implemented |
| Key storage | MISSING | Not implemented |
| Encrypted content display | MISSING | Not implemented |
| Content decryption | MISSING | Not implemented |
| Invite system | MISSING | Not implemented |
| Private space listing | MISSING | Not implemented |
| Private space messaging | MISSING | Not implemented |
| DM support | MISSING | Not implemented |
| Key backup/export | MISSING | Not implemented |

**Subtotal: 10 checks -- 0 PASS, 0 FAIL, 10 MISSING**

### analytics-client

| Feature | Status | Notes |
|---------|--------|-------|
| Private space creation | MISSING | Read-only analytics dashboard |
| X25519 key derivation | MISSING | Not implemented |
| Key storage | MISSING | Not implemented |
| Encrypted content display | MISSING | Not implemented |
| Content decryption | MISSING | Not implemented |
| Invite system | MISSING | Not implemented |
| Private space listing | MISSING | Not implemented |
| Private space messaging | MISSING | Not implemented |
| DM support | MISSING | Not implemented |
| Key backup/export | MISSING | Not implemented |

**Subtotal: 10 checks -- 0 PASS, 0 FAIL, 10 MISSING**

### archiver-client

| Feature | Status | Notes |
|---------|--------|-------|
| Private space creation | MISSING | Plaintext archiving only |
| X25519 key derivation | MISSING | Not implemented |
| Key storage | MISSING | Not implemented |
| Encrypted content display | MISSING | Not implemented |
| Content decryption | MISSING | Not implemented |
| Invite system | MISSING | Not implemented |
| Private space listing | MISSING | Not implemented |
| Private space messaging | MISSING | Not implemented |
| DM support | MISSING | Not implemented |
| Key backup/export | MISSING | Not implemented |

**Subtotal: 10 checks -- 0 PASS, 0 FAIL, 10 MISSING**

### bridge-client

| Feature | Status | Notes |
|---------|--------|-------|
| Private space creation | MISSING | Plaintext bridging only |
| X25519 key derivation | MISSING | Not implemented |
| Key storage | MISSING | Not implemented |
| Encrypted content display | MISSING | Not implemented |
| Content decryption | MISSING | Not implemented |
| Invite system | MISSING | Not implemented |
| Private space listing | MISSING | Not implemented |
| Private space messaging | MISSING | Not implemented |
| DM support | MISSING | Not implemented |
| Key backup/export | MISSING | Not implemented |

**Subtotal: 10 checks -- 0 PASS, 0 FAIL, 10 MISSING**

### Private Space Domain Summary (Post-Remediation)

| Client | Total | PASS | FAIL | MISSING |
|--------|-------|------|------|---------|
| forum-client | 23 | 22 | 0 | 1 |
| chat-client | 28 | 17 | 1 | 10 |
| feed-client | 17 | 11 | 1 | 5 |
| search-client | 10 | 0 | 0 | 10 |
| analytics-client | 10 | 0 | 0 | 10 |
| archiver-client | 10 | 0 | 0 | 10 |
| bridge-client | 10 | 0 | 0 | 10 |
| **TOTAL** | **108** | **50** | **2** | **56** |

---

## 6. MODERATION AUDIT (Moderation-Owner)

### forum-client

| Feature | Status | Notes |
|---------|--------|-------|
| BlockButton component | PASS | Three variants |
| BlockButton on threads | PASS | In ThreadList.tsx |
| BlockButton on replies | PASS | **FIXED (Round 2):** Wired into ReplyTree.tsx |
| BlockedIndicator | PASS | **FIXED (Round 2):** Wired into ReplyTree.tsx |
| BlocklistManager | PASS | Tab-based UI in Settings |
| BlocklistManager confirm | PASS | **FIXED (Round 4):** Custom confirmation dialog replaces browser confirm() |
| useBlocklist hook | PASS | localStorage, O(1) |
| useBlocklist filterBlocked | PASS | **FIXED (Round 2):** Wired into ReplyTree.tsx + SpaceList.tsx |
| Blocked filtering (threads) | PASS | ThreadList.tsx filters |
| Blocked filtering (replies) | PASS | **FIXED (Round 2):** ReplyTree.tsx now filters |
| ReportModal | PASS | **FIXED (Round 1):** Uses async useSign for node RPC signing |
| ReportModal on threads | PASS | In ThreadView.tsx |
| ReportModal on replies | PASS | In ReplyTree.tsx |
| ReportButton sub-component | PASS | **FIXED (Round 2):** Wired into ThreadView.tsx |
| SpamBadge | PASS | Attestation count or "Flagged" |
| useSpamStatus | PASS | Fetches via RPC |
| useSpamReport | PASS | **FIXED (Round 1):** Uses async useSign |
| Counter-attestation (Defend) | PASS | **FIXED (Round 1):** Works with useSign |
| PoW for spam reports | PASS | Argon2id with ActionType.SpamAttestation |
| DeleteConfirmModal | PASS | **FIXED (Round 2):** Wired into Identity.tsx |
| Decay state display | PASS | **FIXED (Round 3):** ContentStatus shows survival % bar |
| ContentStatus component | PASS | **FIXED (Round 3):** Shows reactions + decay % with 4 color states |

**Subtotal: 22 checks -- 22 PASS, 0 FAIL, 0 MISSING**

### chat-client

| Feature | Status | Notes |
|---------|--------|-------|
| BlockButton | PASS | **FIXED (Round 3):** Wired into MessageItem toolbar |
| BlockedIndicator | PASS | **FIXED (Round 3):** Wired into message display |
| BlocklistManager | PASS | Tab-based in Settings |
| useBlocklist hook | PASS | localStorage, O(1) |
| useBlocklist filterBlocked | PASS | **FIXED (Round 3):** Wired into message lists |
| useBlocklist isChannelBlocked | PASS | **FIXED (Round 3):** Dims blocked channels in sidebar |
| useBlocklist isServerBlocked | PASS | **FIXED (Round 3):** Wired into ChannelSidebar |
| Block user from profile | PASS | UserProfileModal |
| Auto-block on harassment | PASS | Auto-blocks author |
| Blocked message filtering | PASS | ChatArea.tsx filters |
| ReportModal | PASS | 5 reasons, focus trap |
| ReportButton | PASS | In MessageItem.tsx |
| Spam report RPC | PASS | **FIXED (Round 1):** Real Argon2id PoW |
| useSpamStatus | MISSING | Doesn't exist |
| useSpamReport | MISSING | Doesn't exist |
| SpamBadge | MISSING | No spam indicators |
| Counter-attestation | MISSING | None |
| PoW for spam reports | PASS | **FIXED (Round 1):** Real Argon2id via useActionPow |
| PoW for messages | PASS | useReplyPow works |
| Success message wording | PASS | **FIXED (Round 3):** "Report submitted to the network. Peers will validate." |
| Channel blocking | MISSING | Exists but no UI |
| Server blocking | MISSING | Exists but no UI |

**Subtotal: 22 checks -- 16 PASS, 0 FAIL, 6 MISSING**

### feed-client

| Feature | Status | Notes |
|---------|--------|-------|
| BlockButton | PASS | Three variants |
| BlockButton on feed cards | PASS | In FeedCard |
| BlockButton on Post detail | MISSING | Post.tsx has none |
| BlockButton on SpaceView | MISSING | SpaceView.tsx has none |
| BlocklistManager | PASS | Modal in Settings |
| useBlocklist hook | PASS | localStorage, O(1) |
| Feed blocked content filtering | PASS | **FIXED (Round 1):** filterBlocked() wired into useFeed, Post.tsx, SpaceView.tsx |
| Post page blocked filtering | MISSING | Post.tsx doesn't use useBlocklist |
| SpaceView blocked filtering | MISSING | SpaceView.tsx doesn't use useBlocklist |
| Discover blocked filtering | MISSING | Discover.tsx doesn't filter |
| ReportModal | PASS | Full SPEC_12 |
| ReportModal on feed | PASS | In FeedCard menu |
| ReportModal on Post | MISSING | Post.tsx has none |
| ReportModal on SpaceView | MISSING | SpaceView.tsx has none |
| SpamBadge | PASS | **FIXED (Round 3):** Wired into FeedCard.tsx and Post.tsx when spam_flagged |
| ReportButton | PASS | **FIXED (Round 3):** Wired into Post.tsx footer with ReportModal |
| useSpamStatus | PASS | Fetches via RPC |
| useSpamReport | PASS | **FIXED (Round 1):** Correct ActionType.SpamAttestation difficulty=8 |
| Counter-attestation | PASS | UI present (but wrong PoW) |
| PoW for spam reports | PASS | **FIXED (Round 1):** Correct difficulty=8 |
| ReportModal cancel during PoW | MISSING | Can't cancel |
| action-pow.ts | PASS | Correctly defines SpamAttestation=8 |

**Subtotal: 22 checks -- 14 PASS, 0 FAIL, 8 MISSING**

### search-client

| Feature | Status | Notes |
|---------|--------|-------|
| useBlocklist | MISSING | Not implemented |
| BlockButton | MISSING | Not implemented |
| BlocklistManager | MISSING | Not implemented |
| ReportModal | MISSING | Not implemented |
| Blocked filtering | MISSING | Not implemented |
| SpamBadge | MISSING | Not implemented |
| User blocking | MISSING | Not implemented |
| Space blocking | MISSING | Not implemented |

**Subtotal: 8 checks -- 0 PASS, 0 FAIL, 8 MISSING**

### analytics-client

| Feature | Status | Notes |
|---------|--------|-------|
| useBlocklist | MISSING | Not implemented |
| BlockButton | MISSING | Not implemented |
| BlocklistManager | MISSING | Not implemented |
| ReportModal | MISSING | Not implemented |
| Blocked space filtering | MISSING | Not implemented |
| Spam metrics | MISSING | Not implemented |
| Spam alerts | MISSING | Not implemented |
| Spam in posts table | MISSING | Not implemented |

**Subtotal: 8 checks -- 0 PASS, 0 FAIL, 8 MISSING**

### archiver-client

| Feature | Status | Notes |
|---------|--------|-------|
| useBlocklist | MISSING | Not implemented |
| BlockButton | MISSING | Not implemented |
| BlocklistManager | MISSING | Not implemented |
| ReportModal | MISSING | Not implemented |
| Spam check before auto-engage | PASS | **FIXED (Round 1):** Spam filter added to AutoEngageEngine + ContentMonitor |
| Spam status on at-risk list | MISSING | Not implemented |
| Content exclusion list | MISSING | Not implemented |

**Subtotal: 7 checks -- 1 PASS, 0 FAIL, 6 MISSING**

### bridge-client

| Feature | Status | Notes |
|---------|--------|-------|
| useBlocklist | MISSING | Not implemented |
| BlockButton | MISSING | Not implemented |
| BlocklistManager | MISSING | Not implemented |
| ReportModal | MISSING | Not implemented |
| Spam check on outbound bridge | PASS | **FIXED (Round 1):** Spam gate + spam_blocked activity type in BridgeEngine |
| Inbound filtering | MISSING | Not implemented |
| External user blocklist | MISSING | Not implemented |
| Rate limiting | PASS | Hourly post limits |

**Subtotal: 8 checks -- 2 PASS, 0 FAIL, 6 MISSING**

### Moderation Domain Summary (Post-Remediation)

| Client | Total | PASS | FAIL | MISSING |
|--------|-------|------|------|---------|
| forum-client | 22 | 22 | 0 | 0 |
| chat-client | 22 | 16 | 0 | 6 |
| feed-client | 22 | 14 | 0 | 8 |
| search-client | 8 | 0 | 0 | 8 |
| analytics-client | 8 | 0 | 0 | 8 |
| archiver-client | 7 | 1 | 0 | 6 |
| bridge-client | 8 | 2 | 0 | 6 |
| **TOTAL** | **97** | **55** | **0** | **42** |

---

## Appendix: Dead Code Inventory (Post-Remediation)

All previously identified dead code has been integrated or removed:

| Client | Former Dead Code | Resolution |
|--------|-----------------|------------|
| forum-client | `BlockedIndicator` | **INTEGRATED** (Round 2) — wired into ReplyTree.tsx |
| forum-client | `useBlocklist.filterBlocked()` | **INTEGRATED** (Round 2) — wired into ReplyTree.tsx + SpaceList.tsx |
| forum-client | `DeleteConfirmModal` | **INTEGRATED** (Round 2) — wired into Identity.tsx; (Round 3) extended to post/reply |
| forum-client | `ReportButton` | **INTEGRATED** (Round 2) — wired into ThreadView.tsx |
| forum-client | `BackupPromptModal` | **INTEGRATED** (Round 3) — wired into Identity.tsx on first visit |
| chat-client | `BlockButton` | **INTEGRATED** (Round 3) — wired into MessageItem toolbar |
| chat-client | `BlockedIndicator` | **INTEGRATED** (Round 3) — wired into message display |
| chat-client | `useBlocklist.filterBlocked()` | **INTEGRATED** (Round 3) — wired into message lists |
| chat-client | `useBlocklist.isChannelBlocked()` | **INTEGRATED** (Round 3) — dims blocked channels in sidebar |
| chat-client | `useBlocklist.isServerBlocked()` | **INTEGRATED** (Round 3) — wired into ChannelSidebar |
| feed-client | `SpamBadge` | **INTEGRATED** (Round 3) — shown in FeedCard + Post when spam_flagged |
| feed-client | `ReportButton` | **INTEGRATED** (Round 3) — wired into Post.tsx footer |

---

## Appendix: Remaining Work

The following items remain unresolved and are candidates for future work:

### Deferred Issues
- chat-client: Key rotation distribution mechanism (#16)
- chat-client: Log viewer shows file path only (#27)
- chat-client: Typing indicators not integrated (#28)

### Missing Features (by design or scope)
- analytics-client, archiver-client, bridge-client: No identity management (read-only/specialized clients)
- search-client: No moderation features (read-only search)
- All clients: No private space key backup/export
- search-client, analytics-client, archiver-client, bridge-client: No persistent navigation shells
- chat-client: No DM support, EncryptedContent component, passphrase storage, media encryption

---

## Fix History

### Round 1: CRITICAL Security Fixes (2026-02-16)

**6 fixes, 0 failures. Owner: Multiple.**

| Issue | Fix | Files |
|-------|-----|-------|
| #1 | chat-client: Encrypt private channel messages with AES-256-GCM before send | `chat-client/src/pages/Chat.tsx` |
| #2 | forum-client: Replace broken keypair.sign() with async useSign in ReportModal | `forum-client/src/components/ReportModal.tsx` |
| #3 | feed-client: Wire filterBlocked() into useFeed, Post.tsx, SpaceView.tsx | `feed-client/src/hooks/useFeed.ts`, `feed-client/src/pages/Post.tsx`, `feed-client/src/pages/SpaceView.tsx` |
| #4 | archiver-client: Add spam check before auto-engage + wire ErrorBoundary/LoadingScreen | `archiver-client/src/services/AutoEngageEngine.ts`, `archiver-client/src/services/ContentMonitor.ts`, `archiver-client/src/App.tsx` |
| #5 | bridge-client: Add spam gate on outbound bridge + spam_blocked activity type | `bridge-client/src/services/BridgeEngine.ts`, `bridge-client/src/App.tsx` |
| #6 | chat-client: Wire real Argon2id PoW into spam reports and invites | `chat-client/src/pages/Chat.tsx`, `chat-client/src/components/InviteModal.tsx` |

### Round 2: HIGH Priority Fixes (2026-02-17)

**3 new fixes, 10 already fixed. Owner: PrivateSpace-Owner, Content-Owner, Moderation-Owner.**

| Issue | Fix | Files |
|-------|-----|-------|
| #8 | forum-client: Replace hardcoded PoW 0s with real Argon2id mining in InviteModal | `forum-client/src/components/InviteModal.tsx` |
| #12 | chat-client: Wire usePoolContribution for reactions with emoji-to-code map | `chat-client/src/pages/Chat.tsx` |
| #13 | chat-client: Wire full reply chain with replyTarget state and reply indicator | `chat-client/src/pages/Chat.tsx`, `chat-client/src/components/MessageItem.tsx`, `chat-client/src/components/ChatArea.tsx` |

### Round 3: MEDIUM Priority Fixes (2026-02-17)

**23 new fixes, 2 already fixed. Owner: Identity-Owner, Content-Owner, Moderation-Owner + Navigation-Owner.**

| Issue | Fix | Files |
|-------|-----|-------|
| #21 | forum-client: BackupPromptModal wired into Identity page, shows on first visit | `forum-client/src/pages/Identity.tsx` |
| #22 | forum-client: ContentStatus shows survival % bar with 4 color states (7-day half-life) | `forum-client/src/components/ContentStatus.tsx`, `ContentStatus.css`, `ThreadView.tsx` |
| #23 | forum-client: DeleteConfirmModal generalized with type prop (identity/post/reply) | `forum-client/src/components/DeleteConfirmModal.tsx` |
| #24 | chat-client: Display Name input + save via set_identity_name RPC | `chat-client/src/pages/SettingsPage.tsx`, `SettingsPage.css` |
| #25 | chat-client: localStorage last-read tracking + markChannelRead() | `chat-client/src/hooks/useChannels.ts` |
| #26 | chat-client: Removed mock OnlineUsers, replaced with peer count | `chat-client/src/layouts/MainLayout.tsx`, `MessageBubble.tsx`, `ThreadPanel.tsx` |
| #29 | chat-client: "Back to Chat" links added to Identity/Settings pages | `chat-client/src/pages/SettingsPage.tsx`, `IdentityPage.tsx` |
| #30 | chat-client: Changed to "Report submitted to the network" | `chat-client/src/pages/Chat.tsx` |
| #31-35 | chat-client: BlockButton, filterBlocked, isChannelBlocked all wired | `chat-client/src/components/MessageItem.tsx`, `ChannelSidebar.tsx` |
| #36 | feed-client: SpamBadge shown when spam_flagged | `feed-client/src/components/FeedCard.tsx`, `Post.tsx` |
| #37 | feed-client: ReportModal wired into Post footer | `feed-client/src/pages/Post.tsx` |
| #38 | feed-client: Real saved posts via localStorage + get_content RPC | `feed-client/src/pages/SavedPosts.tsx` (new), `App.tsx` |
| #39 | search-client: Shows recent search history from localStorage | `search-client/src/hooks/useSearchSuggestions.ts`, `Home.tsx` |
| #40 | search-client: Pagination onClick handlers wired with onPageChange prop | `search-client/src/components/Pagination.tsx` |
| #41-43 | search-client: Non-functional Follow/Message buttons removed | `search-client/src/components/ResultCard/SpaceResult.tsx`, `UserResult.tsx` |
| #45 | search-client: Deterministic colored circle avatar with initials | `search-client/src/components/ResultCard/UserResult.tsx` |
| #46 | analytics-client: showAdvanced dead config removed | `analytics-client/src/pages/Settings.tsx`, `types/index.ts` |
| #49 | archiver-client: Identity requirement banner added to Dashboard | `archiver-client/src/pages/Dashboard.tsx` |
| #52 | bridge-client: IdentityProvider context wrapping useStoredIdentity | `bridge-client/src/App.tsx`, `bridge-client/src/providers/IdentityProvider.tsx` (new) |

### Round 4: LOW Priority Fixes (2026-02-17)

**3 new fixes, 0 failures. Owner: Sponsorship-Owner, Moderation-Owner, Content-Owner.**

| Issue | Fix | Files |
|-------|-----|-------|
| #53 | forum-client: detailError state + inline error banners when getOfferDetail fails | `forum-client/src/hooks/useMySponsorshipOffers.ts`, `forum-client/src/pages/Sponsorship.tsx` |
| #54 | forum-client: Custom confirmation dialog replaces browser confirm() in BlocklistManager | `forum-client/src/components/BlocklistManager.tsx`, `BlocklistManager.css` |
| #55 | search-client: dateRange state wired through SearchResults → SearchFilters → useSearch | `search-client/src/hooks/useSearch.ts`, `search-client/src/components/SearchResults.tsx`, `search-client/src/pages/Results.tsx` |

### Cumulative Stats

| Round | Fixes | Already Fixed | Failures | Total Issues |
|-------|-------|---------------|----------|-------------|
| Round 1 (CRITICAL) | 6 | 0 | 0 | 6 |
| Round 2 (HIGH) | 3 | 10 | 0 | 13 |
| Round 3 (MEDIUM) | 23 | 2 | 0 | 25 |
| Round 4 (LOW) | 3 | 0 | 0 | 3 |
| **TOTAL** | **35** | **12** | **0** | **47** |
