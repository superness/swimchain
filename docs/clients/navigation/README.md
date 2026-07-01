# Navigation & Layout Documentation — All Swimchain Clients

> **Audited:** 2026-02-17 | **Owner:** Navigation-Owner | **Screenshots:** Puppeteer headless (1280x900)

## Screenshots

| Client | Main Page | Settings Page |
|--------|-----------|---------------|
| forum-client (5173) | ![forum-main](forum-main.png) | ![forum-settings](forum-settings.png) |
| search-client (5174) | ![search-main](search-main.png) | N/A |
| chat-client (5175) | ![chat-main](chat-main.png) | ![chat-settings](chat-settings.png) |
| bridge-client (5176) | ![bridge-main](bridge-main.png) | ![bridge-settings](bridge-settings.png) |
| archiver-client (5177) | ![archiver-main](archiver-main.png) | ![archiver-settings](archiver-settings.png) |
| analytics-client (5178) | ![analytics-main](analytics-main.png) | ![analytics-settings](analytics-settings.png) |
| feed-client (5179) | ![feed-main](feed-main.png) | ![feed-settings](feed-settings.png) |

> **Note:** bridge-client, archiver-client, and analytics-client screenshots show the WASM LoadingScreen because WASM modules require the swimchain-wasm package to be built and served via the correct path. The loading screens themselves confirm the LoadingScreen component is working.

---

## Feature Comparison Table

| Feature | forum | chat | feed | search | analytics | archiver | bridge |
|---------|:-----:|:----:|:----:|:------:|:---------:|:--------:|:------:|
| **React Router v6** | Yes (14) | Yes (8) | Yes (12) | Yes (7) | Yes (8) | Yes (5) | Yes (7) |
| **Catch-all 404** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **MainLayout** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Persistent Header** | Yes | Partial | Yes | Yes | Yes | Yes | Yes |
| **Sidebar** | Yes | Yes | No | No | No | No | No |
| **Footer StatusBar** | Yes | No | No | No | No | No | No |
| **NodeStatusBar** | Tauri (271 ln) | Tauri (271 ln) | Tauri (272 ln) | Web (49 ln) | Web (40 ln) | Web (40 ln) | Web (30 ln) |
| **ErrorBoundary** | Yes (103 ln) | Yes (63 ln) | Yes (97 ln) | Yes (92 ln) | Yes (98 ln) | Yes (98 ln) | Yes (98 ln) |
| **LoadingScreen** | Yes | No | Yes | Yes | Yes | Yes | Yes |
| **Toast System** | Yes (190 ln) | Yes (190 ln) | Yes (189 ln) | Yes (59 ln) | Yes (55 ln) | Yes (55 ln) | Yes (55 ln) |
| **RequireIdentity** | Yes | Yes | Yes | No | No | No | No |
| **SponsorshipBanner** | Yes | No | Yes | No | No | No | No |
| **Mobile Nav** | Sidebar collapse | Hamburger overlay | Bottom nav bar | No | No | No | No |
| **Keyboard Shortcuts** | Yes (? j/k/n/r) | Yes (Ctrl+K) | Yes (Ctrl+K) | No | No | No | No |
| **Skip-to-main** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Focus Mgmt** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **DebugPanel** | Yes | Yes | Yes | No | No | No | No |
| **Modals** | 6 types | 3 types | 6 types | No | No | No | No |

---

## Client-by-Client Details

### 1. forum-client (port 5173) — Gold Standard

**Layout:** `MainLayout.tsx` (52 lines)
```
<div class="main-layout">
  <a class="skip-link" />           -- Skip to main content (a11y)
  <Header />                        -- Logo, SearchBox, ProfileButton, Settings gear
  <div class="content-area">
    <Sidebar />                     -- Collapsible, Public/Private tabs, SpaceTree
    <main id="main-content" />      -- Route content
  </div>
  <StatusBar />                     -- Sync %, peer count, storage MB, shortcuts hint
</div>
```

**Provider Stack:** `ErrorBoundary` > `SwimchainProvider` (WASM+LoadingScreen) > `RpcProvider` > `NodeIdentityProvider` > `PreferencesProvider` > `BrowserRouter` > `IdentityProvider` > `SponsorshipProvider` > `KeyboardNavigationProvider`

**Routes (14):** `/identity`, `/settings`, `/sponsorship`, `/profile`, `/profile/:userPk` (public); `/spaces`, `/spaces/:spaceId`, `/spaces/:spaceId/new`, `/spaces/:spaceId/thread/:threadId`, `/spaces/:spaceId/thread/:threadId/reply/:replyId`, `/search`, `/spaces/new/private`, `/chat/:spaceId` (RequireIdentity)

**Key Components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `Header.tsx` | 28 | Logo + SearchBox + ProfileButton nav |
| `Sidebar.tsx` | 110 | Collapsible, Public/Private tabs, SpaceTree, sponsorship footer badge |
| `StatusBar.tsx` | 103 | Footer: sync icon/%, peers, storage MB, shortcuts button. `aria-live="polite"` |
| `NodeStatusBar.tsx` | 271 | Tauri-only. Polls node every 3s via IPC. Dropdown menu (stop/restart/settings/docs). Full keyboard nav. Returns `null` in browser |
| `ErrorBoundary.tsx` | 103 | WASM hint, Try Again + Reload, dev component stack |
| `Loading.tsx` | 23 | Three-ring spinner, "Swimchain", WASM hint |
| `Toast.tsx` | 190 | 4 types, SVG icons, auto-dismiss 4s/6s, max 5, exit animation, `role="alert"` |
| `RequireIdentity.tsx` | ~40 | Spinner > redirect to /identity > saves `from` for redirect-back |
| `DebugPanel.tsx` | ~250 | Modal: RPC, sync, chain height, peers, storage, logs. 5s auto-refresh |

**Screenshot:** Fully loaded. Header with logo+search+profile. Sidebar with 2 spaces. Main content with space cards. Footer: "Synced | 6 peers | 2/500 MB | Shortcuts". SponsorshipBanner visible.

---

### 2. chat-client (port 5175) — Discord-Style

**Layout:** No universal `MainLayout` wrapper for all pages. `Chat.tsx` (488 lines) builds its own 3-column layout:
```
<div class="chat-app">
  <ServerList />                    -- Far-left 72px vertical icon bar
  <ChannelSidebar />                -- 240px channel list with categories
  <ChatArea />                      -- Center message stream
  <NodeStatusBar />                 -- Bottom (Tauri only)
</div>
```
A `MainLayout.tsx` (122 lines) exists for space sidebar + network panel but Identity/Settings pages render **without any navigation chrome**.

**Provider Stack:** `IdentityProvider` > `ToastProvider` > `PresenceProvider` > `TypingProvider` > `BrowserRouter`

**Routes (8):** `/identity` (public); `/channels/@me`, `/channels/:serverId`, `/channels/:serverId/:channelId`, `/settings`, `/channels/create-private`, `/servers/discover` (RequireIdentity)

**Key Components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `ServerList.tsx` | 129 | Vertical icons, home button, initials fallback, color hash, active/unread pills |
| `ChannelSidebar.tsx` | 295 | Category grouping, collapse/expand, channel type icons, unread badges, user area |
| `ChatArea.tsx` | ~300 | Message grouping (5min), blocked filtering, auto-scroll, empty welcome |
| `NodeStatusBar.tsx` | 271 | Tauri-only, identical to forum-client |
| `ErrorBoundary.tsx` | 63 | Simpler: optional fallback prop, retry button |
| `Toast.tsx` | 190 | Full-featured with SVG icons and exit animations |

**Screenshot:** Shows Identity page (no identity yet). Only "Back" link + "Identity" title — no persistent nav shell.

**Known Issue:** Identity and Settings pages have no navigation chrome.

---

### 3. feed-client (port 5179) — Social Feed

**Layout:** `MainLayout.tsx` (146 lines)
```
<div class="app">
  <a class="skip-link" />           -- Skip to main content
  <header>                          -- Logo, nav (Feed/Discover/Sponsorship), Profile/Settings
  </header>
  <SponsorshipBanner />             -- Conditional top banner
  <main id="app-main" />            -- Route content
  <MobileNav />                     -- Bottom bar (Feed/Discover/Sponsor/Profile icons)
  <NodeStatusBar />                 -- Tauri-only
</div>
```

**Provider Stack:** `ErrorBoundary` > `SwimchainProvider` > `RpcProvider` > `NodeIdentityProvider` > `IdentityProvider` > `SponsorshipProvider` > `ToastProvider` > `BrowserRouter` > `KeyboardNavigationProvider`

**Routes (12):** `/`, `/discover`, `/identity`, `/post/:postId`, `/space/:spaceId` (public); `/compose`, `/sponsorship`, `/profile`, `/profile/:userPk`, `/create-private-space`, `/settings`, `/saved` (RequireIdentity)

**Key Components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `MainLayout.tsx` | 146 | Header + mobile bottom nav + SponsorshipBanner + NodeStatusBar |
| `NodeStatusBar.tsx` | 272 | Tauri-only, same as forum/chat |
| `ErrorBoundary.tsx` | 97 | WASM hint, dev stack, fallback prop |
| `Loading.tsx` | 22 | "Swimchain Feed" / "Initializing your curated feed..." |
| `Toast.tsx` | 189 | Full-featured, SVG icons, assertive/polite aria-live |

**Screenshot:** Fully loaded. Header: "Swimchain Feed | Feed | Discover | Sponsorship | Create Identity". Content: "Your Feed" with search, Recent/Hot tabs, empty state, "+ Post" FAB.

---

### 4. search-client (port 5174) — Search Engine

**Layout:** `MainLayout.tsx` (38 lines)
```
<div class="main-layout">
  <a class="skip-link" />           -- Skip to main content
  <header>                          -- "Swimchain Search" + nav (Home/Search/Identity)
  </header>
  <main id="main-content" />        -- Route content
  <NodeStatusBar />                 -- Simple web footer
</div>
```

**Provider Stack:** `ErrorBoundary` > `SwimchainProvider` > `RpcProvider` > `IdentityProvider` > `ToastProvider` > `BrowserRouter` > `MainLayout`

**Routes (7):** `/` (Home), `/search` (Results), `/identity`; `/space/:spaceId`, `/thread/:threadId`, `/user/:userId` (redirect to forum-client via `window.location.href`); `*` → `/`

**Key Components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `MainLayout.tsx` | 38 | Header with 3 nav links, active link styling, NodeStatusBar footer |
| `NodeStatusBar.tsx` | 49 | Web footer: status dot + label (Synced/Syncing/Behind/Offline), peer count, storage |
| `ErrorBoundary.tsx` | 92 | WASM hint, dev stack, Try Again + Reload |
| `Loading.tsx` | 23 | "Swimchain Search" / "Loading WASM modules" |
| `Toast.tsx` | 59 | Lightweight: context-based, max 5, auto-dismiss |
| `Home.tsx` | 140 | Google-style centered search, tips chips, trending, recent history |
| `Results.tsx` | 122 | Search bar, tabs/sort/date filters, load-more pagination |

**Screenshot:** Fully loaded. Header: "Swimchain Search | Home | Search | Identity". Centered search with tips. Footer: "Powered by Swimchain".

**Known Issue:** Footer links (`/about`, `/help`, `/privacy`, `/terms`) → unregistered routes → silent redirect to `/`.

---

### 5. analytics-client (port 5178) — Network Analytics

**Layout:** `MainLayout.tsx` (49 lines)
```
<div class="main-layout">
  <a class="skip-link" />           -- Skip to main content
  <header>                          -- "Swimchain Analytics" + nav (6 links)
  </header>
  <main id="main-content" />        -- Route content
  <NodeStatusBar />                 -- Simple web footer
</div>
```

**Provider Stack:** `ErrorBoundary` > `SwimchainProvider` > `RpcProvider` > `IdentityProvider` > `ToastProvider` > `BrowserRouter` > `MainLayout`

**Routes (8):** `/` (Dashboard), `/spaces`, `/spaces/:spaceId`, `/settings`, `/moderation`, `/sponsorship`, `/identity`; `*` → `/`

**Key Components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `MainLayout.tsx` | 49 | Header with 6 nav links (Dashboard/Spaces/Moderation/Sponsorship/Identity/Settings) |
| `NodeStatusBar.tsx` | 40 | Web footer: connected/disconnected, network, peers, version |
| `ErrorBoundary.tsx` | 98 | Standard: WASM hint, dev stack, retry/reload |
| `Loading.tsx` | 23 | "Swimchain Analytics" / "Initializing network analytics..." |
| `Toast.tsx` | 55 | Lightweight context-based toasts |

**Screenshot:** Shows WASM LoadingScreen (WASM not available in headless). Confirms LoadingScreen works.

---

### 6. archiver-client (port 5177) — Content Preservation

**Layout:** `MainLayout.tsx` (47 lines) — same structure as analytics-client.

**Provider Stack:** `ErrorBoundary` > `SwimchainProvider` > `RpcProvider` > `IdentityProvider` > `ToastProvider` > `Suspense` (LoadingScreen) > `BrowserRouter` > `MainLayout`

**Routes (5):** `/` → `/dashboard`, `/dashboard`, `/archived`, `/settings`, `/identity`; `*` → `/dashboard`

**Key Components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `MainLayout.tsx` | 47 | Header with 4 nav links (Dashboard/Archived/Identity/Settings) |
| `NodeStatusBar.tsx` | 40 | Web footer: connected/disconnected, network, peers, version |
| `ErrorBoundary.tsx` | 98 | Standard |
| `Loading.tsx` | 22 | "Swimchain Archiver" / "Initializing content preservation..." |
| `Toast.tsx` | 55 | Lightweight context-based toasts |

**Screenshot:** Shows WASM LoadingScreen. Confirms LoadingScreen works.

**Known Issue:** `useRpc.tsx` console log says "Analytics client connecting" (copy-paste artifact). `IdentityProvider` hardcodes `RPC_URL = localhost:19736`.

---

### 7. bridge-client (port 5176) — Cross-Platform Bridge

**Layout:** `MainLayout.tsx` (49 lines) — same structure as analytics/archiver.

**Provider Stack:** `RpcProvider` > `IdentityProvider` > `ErrorBoundary` > `Suspense` (LoadingScreen) > `ToastProvider` > `BrowserRouter` > `MainLayout`

**Routes (7):** `/` → `/dashboard`, `/dashboard`, `/matrix`, `/irc`, `/activity`, `/settings`, `/identity`; `*` → `/dashboard`

**Key Components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `MainLayout.tsx` | 49 | Header with 6 nav links (Dashboard/Matrix/IRC/Activity/Identity/Settings) |
| `NodeStatusBar.tsx` | 30 | Minimal web footer: connected/disconnected only |
| `ErrorBoundary.tsx` | 98 | Standard |
| `Loading.tsx` | 23 | "Swimchain Bridge" / "Initializing cross-platform bridge..." |
| `Toast.tsx` | 55 | Lightweight context-based toasts |

**Screenshot:** Shows WASM LoadingScreen. Confirms LoadingScreen works.

**Recent Fixes:** RpcProvider was never mounted (CRITICAL, now fixed). Hardcoded RPC endpoint fixed. Duplicate nav in Dashboard removed. Identity page hardcoded URL fixed.

---

## Architecture Patterns

### Provider Stack (common pattern)

All clients follow a layered provider pattern:
```
ErrorBoundary              -- Catches unrecoverable React errors
  SwimchainProvider        -- Loads WASM modules (shows LoadingScreen fallback)
    RpcProvider            -- JSON-RPC connection to node
      IdentityProvider     -- Ed25519 keypair from localStorage
        ToastProvider      -- Notification system
          BrowserRouter    -- Client-side routing
            MainLayout     -- Persistent header + footer
              Routes       -- Page content
```

### NodeStatusBar Variants

| Variant | Used By | Lines | Features | Visibility |
|---------|---------|-------|----------|------------|
| **Tauri (full)** | forum, chat, feed | 271-272 | Polls Tauri IPC every 3s, dropdown menu (stop/restart/settings/docs), full keyboard nav | Tauri desktop only, returns `null` in browser |
| **Web (simple)** | search, analytics, archiver, bridge | 30-49 | Reads from useRpc() hook, shows connected/disconnected + peer count | Always visible in browser |

### Client Tiers

| Tier | Clients | Characteristics |
|------|---------|-----------------|
| **Tier 1** | forum, chat, feed | Full sidebar/multi-column layouts, RequireIdentity guards, DebugPanel, keyboard shortcuts, mobile responsive, modals, sponsorship |
| **Tier 2** | search | MainLayout header+footer, cross-client redirects, specialized search UI |
| **Tier 3** | analytics, archiver, bridge | MainLayout header+footer, focused utility UIs, no auth guards, no modals |

### Shared Design Tokens

All clients use consistent visual design:
- Dark background: `#1a1a2e`
- Text: `#e0e0ff`
- Accent: `#4fc3f7`
- Gradient: `#00d4ff` → `#7b68ee` (cyan to purple)
- Error: `#ff6b6b`
- Loading spinner: 3 concentric rings with staggered CSS animation
- Toast: context provider, 4 types, auto-dismiss (4s/6s for errors), max 5

---

## Known Gaps and Issues

### Critical
1. **chat-client:** No persistent layout shell on Identity/Settings pages. Users must use browser back button.

### High
2. **search-client:** Footer links (`/about`, `/help`, `/privacy`, `/terms`) → unregistered routes → silent redirect.
3. **feed-client:** `NodeStatusBar.tsx:261` — `onSettingsClick` prop always `undefined`; Settings dropdown item does nothing.
4. **bridge-client:** `NodeStatusBar.tsx` minimal (30 lines) — only shows connected/disconnected, no peer count or network info.

### Medium
5. **Utility clients (analytics, archiver, bridge)** lack RequireIdentity guards — all routes publicly accessible.
6. **No DebugPanel** in search, analytics, archiver, bridge — no node diagnostics for troubleshooting.
7. **No mobile-responsive nav** in search, analytics, archiver, bridge — header wraps but no hamburger/bottom nav.
8. **archiver-client:** `useRpc.tsx:77` says "Analytics client connecting" (copy-paste).
9. **archiver-client:** `IdentityProvider` hardcodes `RPC_URL = localhost:19736`, bypassing shared config.
10. **bridge-client:** `BridgeEngine.ts:533-534` hardcodes testnet mode for PoW difficulty.

### Low
11. **Inconsistent NodeStatusBar:** Tier 1 clients use Tauri-only (invisible in browser), Tier 3 use simple web variant. Users running multiple clients see inconsistent footer behavior.
12. **No SponsorshipBanner** in chat, search, analytics, archiver, bridge — only forum and feed warn about unsponsored identity.
