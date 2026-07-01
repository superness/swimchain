# Moderation Features — Cross-Client Documentation

This document describes the moderation capabilities across all 7 Swimchain client applications. Moderation is decentralized: there are no moderators or review teams. Instead, users block content locally (client-side localStorage) and submit spam attestations to the network with proof-of-work (SPEC_12).

## Feature Comparison Table

| Feature | forum-client | chat-client | feed-client | search-client | analytics-client | archiver-client | bridge-client |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **BlockButton** | Yes (3 variants) | Yes (3 variants) | Yes (3 variants) | Yes (icon only) | No | No | No |
| **BlocklistManager** | Yes (4 tabs) | Yes (4 tabs) | Yes (4 tabs) | No | Yes (dedicated page) | No (inline Settings) | No (inline Settings) |
| **ReportModal** | Yes (PoW + Defend) | Yes (5 reasons) | Yes (PoW + Defend) | No | No | No | No |
| **SpamBadge** | Yes | No | Yes | No | No | No | No |
| **useBlocklist hook** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Content filtering** | Threads + Replies + Spaces | Messages + Channels | Feed + Spaces + Posts | Search results | No | Dashboard at-risk list | BridgeEngine outbound |
| **Spam report PoW** | Yes (Argon2id) | Partial (hardcoded 0) | Yes (Argon2id) | No | No | No | No |
| **Counter-attestation** | Yes (Defend) | No | Yes (Defend) | No | No | No | No |
| **Spam status check** | Yes (useSpamStatus) | No | Yes (useSpamStatus) | No | No | No | Yes (isSpamFlagged) |
| **Auto-block on harassment** | No | Yes | No | No | No | No | No |
| **Channel/server blocking** | No | Yes | No | No | No | No | No |
| **Confirm dialog (custom)** | Yes | Yes | Yes | N/A | Yes | N/A | N/A |
| **DeleteConfirmModal** | Yes | No | No | No | No | No | No |

## localStorage Keys

Each client uses a localStorage key for blocklist persistence. Blocklists are client-side only — blocked content still exists on the network.

| Client | localStorage Key |
|--------|-----------------|
| forum-client | `swimchain-blocklist` |
| chat-client | `swimchain-blocklist` |
| feed-client | `swimchain-blocklist` |
| search-client | `swimchain-search-blocklist` |
| analytics-client | `swimchain-analytics-blocklist` |
| archiver-client | `swimchain-archiver-blocklist` |
| bridge-client | `swimchain-bridge-blocklist` |

> **Note**: forum-client, chat-client, and feed-client share the same key (`swimchain-blocklist`). Blocking a user in one client also blocks them in the others when run in the same browser.

## BlockType Support

| Client | Types |
|--------|-------|
| forum-client | `user`, `post`, `space`, `reply` |
| chat-client | `user`, `message`, `channel`, `server` |
| feed-client | `user`, `post`, `space`, `reply` |
| search-client | `user`, `post`, `space`, `reply` |
| analytics-client | `user`, `post`, `space`, `reply` |
| archiver-client | `user`, `post`, `space`, `reply` |
| bridge-client | `user`, `post`, `space`, `reply` |

---

## Client-by-Client Details

### 1. forum-client (port 5173)

The reference implementation with the most complete moderation stack.

**Components:**

| File | Purpose |
|------|---------|
| `src/components/BlockButton.tsx` + `.css` | Dropdown with "Block this post/reply" and "Block this author". Three variants: `icon`, `text`, `menu-item`. |
| `src/components/BlocklistManager.tsx` + `.css` | 4-tab manager (Users / Posts / Spaces / Replies) in Settings. Shows blocked items with timestamps, unblock buttons, and "Clear All" with custom confirmation dialog. |
| `src/components/ReportModal.tsx` + `.css` | SPEC_12 spam attestation. 5 reasons, Argon2id PoW mining, Ed25519 signing via `useSign`, counter-attestation "Defend" button. Exports `SpamBadge` and `ReportButton` sub-components. |
| `src/components/DeleteConfirmModal.tsx` + `.css` | Type-to-confirm deletion for identity. Shows on Identity page. |
| `src/hooks/useBlocklist.ts` | O(1) Set-based lookups. `filterBlocked()`, `isUserBlocked()`, `isSpaceBlocked()`, `block()`, `unblock()`, `clearAll()`. |
| `src/hooks/useSign.ts` | Async signing — tries stored keypair first, falls back to node RPC. Used by ReportModal. |

**Where moderation is wired:**
- `ThreadList.tsx` — BlockButton on each thread. Filters blocked posts and authors.
- `ReplyTree.tsx` — BlockButton + ReportModal on each reply. Filters blocked replies and authors via `filterBlocked()`.
- `ThreadView.tsx` — ReportModal for thread OP reporting. SpamBadge on thread header.
- `SpaceList.tsx` — Filters blocked spaces via `isSpaceBlocked()`.
- `Settings.tsx` — BlocklistManager in Blocked Content section.
- `Identity.tsx` — DeleteConfirmModal for identity deletion.

---

### 2. chat-client (port 5175)

Discord-style messaging with full blocking but partial spam reporting.

**Components:**

| File | Purpose |
|------|---------|
| `src/components/BlockButton.tsx` + `.css` | Block menu for messages and users. Wired into `MessageItem.tsx` toolbar. |
| `src/components/BlocklistManager.tsx` + `.css` | 4-tab manager (Users / Messages / Channels / Servers) in Settings page. |
| `src/components/ReportModal.tsx` + `.css` | 5 spam reasons, focus trap, keyboard nav. Takes `onSubmit` callback. |
| `src/hooks/useBlocklist.ts` | Supports users/messages/channels/servers. Exports `isChannelBlocked()`, `isServerBlocked()`. |

**Where moderation is wired:**
- `MessageItem.tsx` — BlockButton + ReportButton in message action toolbar (non-own messages only).
- `ChatArea.tsx` — Filters messages from blocked users and blocked message IDs.
- `ChannelSidebar.tsx` — Dims blocked channels (opacity 0.4, `channel-item--blocked` class).
- `UserProfileModal.tsx` — Direct block/unblock toggle on user profiles.
- `Chat.tsx` — Auto-blocks author when reporting for `harassment`. Report success: "Report submitted to the network. Peers will validate this spam attestation."
- `SettingsPage.tsx` — BlocklistManager.

**Known issues:**
- PoW nonce hardcoded to `0` for spam reports (no real PoW mined).
- No SpamBadge — flagged messages have no visual indicator.
- No counter-attestation (Defend) UI.
- `isServerBlocked()` exported but never used for filtering.

---

### 3. feed-client (port 5179)

Social feed with full moderation stack comparable to forum-client.

**Components:**

| File | Purpose |
|------|---------|
| `src/components/BlockButton.tsx` + `.css` | Standard block menu. Used on `FeedCard.tsx` and `Post.tsx`. |
| `src/components/BlocklistManager.tsx` + `.css` | 4-tab manager with ARIA roles (`role="tab"`, `role="tabpanel"`, `aria-selected`). Most accessible implementation. |
| `src/components/ReportModal.tsx` + `.css` | Full PoW-based reporting. Exports `SpamBadge` and `ReportButton`. Defend button. |
| `src/hooks/useBlocklist.ts` | Standard pattern. Supports both `author` and `authorId` fields in `filterBlocked()`. |

**Where moderation is wired:**
- `FeedCard.tsx` — BlockButton in "..." menu. ReportModal. SpamBadge.
- `Post.tsx` — BlockButton + ReportModal + SpamBadge + ReportButton in footer (non-own posts).
- `SpaceView.tsx` — Filters blocked posts.
- `useFeed.ts` — Filters blocked spaces and posts from main feed.
- `Settings.tsx` — BlocklistManager as modal.

---

### 4. search-client (port 5174)

Minimal moderation: blocking and filtering only, no reporting.

**Components:**

| File | Purpose |
|------|---------|
| `src/components/BlockButton.tsx` + `.css` | Simplified icon-only block button for search results. |
| `src/hooks/useBlocklist.ts` | Key: `swimchain-search-blocklist`. Standard API. |

**Where moderation is wired:**
- `ThreadResult.tsx`, `ReplyResult.tsx`, `UserResult.tsx`, `SpaceResult.tsx` — BlockButton on each result card.
- `SearchResults.tsx` — `filterBlocked()` hides blocked threads, replies, users, and spaces from results.

**Not present:** BlocklistManager, ReportModal, SpamBadge, spam hooks.

---

### 5. analytics-client (port 5178)

Monitoring dashboard with dedicated moderation management page.

**Components:**

| File | Purpose |
|------|---------|
| `src/pages/Moderation.tsx` + `.css` | Dedicated `/moderation` route. Stats cards (blocked counts), 3-tab manager (Users / Spaces / Posts), add by address, unblock, "Clear All" with confirmation. |
| `src/hooks/useBlocklist.ts` | Key: `swimchain-analytics-blocklist`. |

**Where moderation is wired:**
- `/moderation` route in `App.tsx`.
- "Moderation" nav link in `MainLayout.tsx`.
- Moderation page manages blocklist. Note: "Blocked items are hidden from analytics views."

**Not present:** BlockButton, ReportModal, SpamBadge, spam metrics display.

---

### 6. archiver-client (port 5177)

Content preservation with blocklist-based exclusion from auto-engagement.

**Components:**

| File | Purpose |
|------|---------|
| `src/hooks/useBlocklist.ts` | Key: `swimchain-archiver-blocklist`. |

**Where moderation is wired:**
- `Dashboard.tsx` — Filters at-risk content to exclude blocked authors. Prevents auto-engaging spam. Shows offline indicator when disconnected.
- `Settings.tsx` — "Blocked Authors" section with add/remove UI (tag-style display).
- `ContentMonitor.ts` — Fetches contributor counts from pool RPC. Catches spam check errors (fails open).

**Not present:** BlockButton, BlocklistManager (inline Settings only), ReportModal, SpamBadge.

---

### 7. bridge-client (port 5176)

Cross-platform bridge with spam and blocklist filtering on outbound content.

**Components:**

| File | Purpose |
|------|---------|
| `src/hooks/useBlocklist.ts` | Key: `swimchain-bridge-blocklist`. Extra: `getBlockedUserIds()` static helper for non-React code. |

**Where moderation is wired:**
- `BridgeEngine.ts` — Checks both blocklist AND spam status (`isSpamFlagged()` RPC — 3+ unique attestations) before bridging to Matrix/IRC. Skips blocked users and flagged content.
- `Settings.tsx` — "Blocked Users" section. "Content from blocked users will not be bridged to external platforms."
- `RateLimiter.ts` — Rate limiting + daily PoW budget for flood protection.

**Not present:** BlockButton, BlocklistManager (inline Settings only), ReportModal, SpamBadge. No inbound filtering from Matrix/IRC.

---

## Architecture: How Blocking Works

```
User clicks "Block" on a post/user
        |
        v
  BlockButton.tsx
  calls useBlocklist().block(id, type)
        |
        v
  localStorage.setItem(key, JSON.stringify(blocklist))
        |
        v
  React state updates -> components re-render
        |
        v
  filterBlocked() / isBlocked() / isUserBlocked()
  applied in list components to hide blocked items
```

## Architecture: How Spam Reporting Works (SPEC_12)

```
User clicks "Report Spam"
        |
        v
  ReportModal.tsx opens
  User selects reason (1 of 5)
        |
        v
  Argon2id PoW mining begins
  (ActionType.SpamAttestation = 0x08, difficulty 8)
        |
        v
  useSign() creates Ed25519 signature
  over (content_hash + reporter_pubkey + reason + nonce)
        |
        v
  RPC: submit_spam_attestation
  { content_id, reporter, reason, pow_nonce, pow_hash, signature }
        |
        v
  Network validates PoW + signature
  Attestation count increments on content
        |
        v
  When attestation_count >= threshold (3):
  Content decay accelerates (7-day -> 4-hour half-life)

  Users can submit counter-attestations to defend content
```

## Screenshots

Screenshots captured from running clients (may appear blank if node is not running or identity not set):

| Client | Page | File |
|--------|------|------|
| forum-client | Settings (Blocked Content) | `forum-settings.png` |
| chat-client | Settings | `chat-settings.png` |
| feed-client | Settings | `feed-settings.png` |
| search-client | Home (with BlockButton on results) | `search-home.png` |
| analytics-client | /moderation page | `analytics-moderation.png` |
| archiver-client | Settings (Blocked Authors) | `archiver-settings.png` |
| bridge-client | Settings (Blocked Users) | `bridge-settings.png` |

## Known Issues and Gaps

| Severity | Client | Issue |
|----------|--------|-------|
| HIGH | chat-client | PoW nonce hardcoded to `0` for spam reports — no actual proof-of-work mined |
| HIGH | chat-client | No SpamBadge — flagged messages have no visual indicator |
| HIGH | chat-client | No counter-attestation (Defend) UI |
| MEDIUM | search-client | No BlocklistManager — users can block from results but cannot view/manage blocks |
| MEDIUM | search-client | No ReportModal — cannot report spam from search results |
| MEDIUM | analytics-client | No spam attestation metrics despite being a monitoring tool |
| MEDIUM | analytics-client | Blocklist managed but not actively applied to filter dashboard metrics |
| MEDIUM | archiver-client | ContentMonitor spam check fails open — catches errors and proceeds |
| MEDIUM | bridge-client | BridgeEngine spam check fails open — catches errors, returns false |
| MEDIUM | bridge-client | No inbound content filtering from Matrix/IRC |
| LOW | forum/chat/feed | Share same `swimchain-blocklist` localStorage key — cross-client blocking |
| LOW | All clients | Debug `console.log('[Blocklist]...')` statements left in production useBlocklist hooks |

## File Inventory

| Client | Moderation Files |
|--------|-----------------|
| forum-client | `BlockButton.tsx`, `BlockButton.css`, `BlocklistManager.tsx`, `BlocklistManager.css`, `ReportModal.tsx`, `ReportModal.css`, `DeleteConfirmModal.tsx`, `DeleteConfirmModal.css`, `useBlocklist.ts`, `useSign.ts`, `useSpamReport` (useRpc.tsx), `useSpamStatus` (useRpc.tsx) |
| chat-client | `BlockButton.tsx`, `BlockButton.css`, `BlocklistManager.tsx`, `BlocklistManager.css`, `ReportModal.tsx`, `ReportModal.css`, `useBlocklist.ts` |
| feed-client | `BlockButton.tsx`, `BlockButton.css`, `BlocklistManager.tsx`, `BlocklistManager.css`, `ReportModal.tsx`, `ReportModal.css`, `useBlocklist.ts` |
| search-client | `BlockButton.tsx`, `BlockButton.css`, `useBlocklist.ts` |
| analytics-client | `Moderation.tsx`, `Moderation.css`, `useBlocklist.ts` |
| archiver-client | `useBlocklist.ts` |
| bridge-client | `useBlocklist.ts` |
