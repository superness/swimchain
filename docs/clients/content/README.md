# Content Features Across Swimchain Clients

> Audit date: 2026-02-18
> Auditor: Content-Owner
> Clients: forum, chat, feed, search, analytics, archiver, bridge

## Screenshots

All screenshots captured via Puppeteer (1280x900, headless Chrome, 10s WASM wait).

| Client | Port | Screenshots |
|--------|------|-------------|
| **Forum** | 5173 | [Main](forum-main.png) &middot; [Spaces](forum-spaces.png) |
| **Search** | 5174 | [Main](search-main.png) |
| **Chat** | 5175 | [Main](chat-main.png) |
| **Bridge** | 5176 | [Main](bridge-main.png) &middot; [Activity](bridge-activity.png) |
| **Archiver** | 5177 | [Main](archiver-main.png) &middot; [Archived](archiver-archived.png) |
| **Analytics** | 5178 | [Main](analytics-main.png) &middot; [Spaces](analytics-spaces.png) |
| **Feed** | 5179 | [Main](feed-main.png) |

**Notes:** Bridge, archiver, and analytics screenshots show WASM loading screens (longer init time or running node needed). Forum and feed screenshots show full UI with synced node.

Screenshots can be regenerated with:
```bash
node docs/clients/content/take-screenshots.js
```
Requires all 7 client dev servers running on ports 5173-5179 and puppeteer in `scripts/node_modules/`.

---

## Feature Comparison Table

Rows = content features, Columns = clients.
**Yes** = fully implemented, **Partial** = exists but limited, **No** = not present.

| Feature | Forum | Chat | Feed | Search | Analytics | Archiver | Bridge |
|---------|-------|------|------|--------|-----------|----------|--------|
| **Posting** | Yes | Yes | Yes | No | No | No | Yes (bridged) |
| **Replies / Threading** | Yes (depth 5) | Yes (flat) | Yes (depth 4) | No | No | No | No |
| **Reactions (emoji)** | Yes (8, PoW) | Yes (8, PoW) | Yes (8, PoW) | No | No | No | No |
| **Image Upload** | Yes (4, 1MB) | Yes (4, 10MB) | Yes (4, 1MB) | No | No | No | No |
| **Image Gallery / Lightbox** | Yes | Yes | Yes | No | No | No | No |
| **Encrypted Content** | Yes (AES-GCM) | Yes (AES-GCM) | No | No | No | No | Yes (decrypt) |
| **Private Spaces (E2E)** | Yes (X25519) | Yes (X25519) | Yes | No | No | No | Yes (key mgmt) |
| **Decay Indicator** | Yes | No | Yes | Yes | Yes | Yes (+Preserved) | Yes |
| **Spam Reporting (PoW)** | Yes | Yes | Yes | No | No | No | Yes (filter) |
| **Spam Badge** | Yes | Yes | Yes | No | No | No | No |
| **Blocklist** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Sponsorship System** | Yes (3 tabs) | No | Yes (3 tabs) | No | Yes (analytics) | No | No |
| **Identity** | Node-managed | Browser PoW | Browser PoW | Node-managed | Node-managed | Node-managed | Node sync |
| **Display Name** | Yes | Yes | Yes | No | Yes | Yes | No |
| **Search** | No | Yes (Ctrl+K) | Yes (client) | Yes (RPC) | No | Yes (archive) | No |
| **Proof-of-Work** | Post/Reply/React | Post/Reply/React/Report | Post/Reply/React | No | No | Auto-engage | Bridge posts |
| **ContentStatus Component** | Yes | No | Partial (FeedCard) | Yes | Yes | Yes | Yes |
| **Node Status Bar** | No | No | No | No | Yes | Yes | Yes |
| **Debug Panel** | No | Yes | Yes | No | No | No | No |
| **Auto-Engagement** | No | No | No | No | No | Yes | No |
| **Content Monitoring** | No | No | No | No | Yes | Yes | Yes |
| **User Profiles** | Yes | Yes (modal) | Yes | Yes (card) | No | No | No |
| **Saved / Bookmarks** | No | No | Yes | No | No | No | No |
| **Activity Log** | No | No | No | No | No | No | Yes |

---

## Client Descriptions

### 1. Forum Client (`forum-client/`, port 5173)

**Role:** Primary discussion platform. Full-featured threaded forum with spaces.

**Content Features:**
- 10 routes: spaces, threads, replies, private chat, sponsorship, profiles, identity
- Deep nested reply tree (max depth 5) with collapse/expand at depth 3
- ContentStatus decay bar: `survival% = pow(0.5, ageDays/7) * 100`
  - Healthy (>75%), Active (40-75%), Stale (15-40%), Decaying (<15%)
- 8 emoji reactions requiring PoW contribution (10s mining per reaction)
- Image upload (4 max, 1MB) with optional AES-GCM encryption
- Auto-decrypt with stored passphrases (per-content + default)
- Private spaces with X25519 ECDH key exchange
- Full sponsorship system: browse offers, claim, approve/reject, cancel
- Spam reporting with PoW-backed attestation (SPEC_12)
- Node-managed identity (keypair on node, not browser)

**Key Files:** `ThreadView.tsx`, `ReplyTree.tsx`, `NewThread.tsx`, `ContentStatus.tsx`, `EncryptedContent.tsx`, `ChatView.tsx`, `Sponsorship.tsx`

---

### 2. Chat Client (`chat-client/`, port 5175)

**Role:** Discord-style real-time messaging.

**Content Features:**
- Server list + channel sidebar + message area layout
- Spaces mapped to servers, threads to channels, replies to messages
- Real-time polling (5s messages, 15s channels, 30s servers)
- Optimistic UI with pending/sent/failed states
- 8 emoji reactions with PoW-mined contributions
- Image attachments (4 max, 10MB, auto-compress)
- E2E encrypted private channels with X25519 key exchange
- Spam reporting with auto-block for harassment
- Typing and presence indicators
- Client-side search (Ctrl+K)
- Browser-stored Ed25519 identity with PoW mining (difficulty 20)

**Key Limitation:** No decay indicators. Messages treated as permanent despite protocol decay.

**Key Files:** `Chat.tsx`, `MessageItem.tsx`, `ChatMessageInput.tsx`, `ChannelSidebar.tsx`, `ServerList.tsx`

---

### 3. Feed Client (`feed-client/`, port 5179)

**Role:** Social media feed aggregator (Twitter/Reddit style).

**Content Features:**
- Aggregated feed from followed spaces with hot/recent sorting
- FeedCard with 4 decay states: protected (100%), active (80%), stale (40%), decayed (10%)
- Compose page with image upload (4 max, 1MB), PoW mining
- Reply threading (max depth 4)
- 8 emoji reactions with PoW engagement
- Save/bookmark posts (localStorage)
- Follow/unfollow/mute spaces
- User profiles with avatar, bio, website
- Full sponsorship system (3 tabs)
- Infinite scroll pagination (20 items per page)
- Client-side blocklist filtering (users + posts + spaces)

**Key Files:** `Feed.tsx`, `FeedCard.tsx`, `Compose.tsx`, `Post.tsx`, `ReactionPicker.tsx`, `SavedPosts.tsx`

---

### 4. Search Client (`search-client/`, port 5174)

**Role:** Google-style full-text search across the network.

**Content Features:**
- Large centered search bar with query syntax tips
- Advanced query syntax: `author:`, `type:`, `"exact phrase"`, `after:`, `has:media`
- 5 result type tabs: All, Spaces, Threads, Replies, Users
- ContentStatus decay bar on ThreadResult and ReplyResult cards
- Search highlighting with `<mark>` tags
- Sort: relevance, recent, reactions, replies
- Date range: any, day, week, month, year
- Pagination with page numbers
- Trending searches + search history (localStorage)
- Deep links to forum-client for viewing results
- Read-only: no posting, replying, or reacting

**Key Files:** `Home.tsx`, `Results.tsx`, `SearchResults.tsx`, `ThreadResult.tsx`, `ContentStatus.tsx`, `useSearch.ts`

---

### 5. Analytics Client (`analytics-client/`, port 5178)

**Role:** Network health monitoring dashboard. Read-only.

**Content Features:**
- Network health score (0-100) per SPEC_09:
  - Swimmer Score (0-30): active node count
  - Risk Score (0-30): posts at decay risk
  - Sync Score (0-20): chain sync recency
  - Heat Score (0-20): average engagement
- MetricsCollector service with configurable polling (30s default)
- Space analytics: total/at-risk/healthy posts, avg heat, active contributors
- Heat distribution histograms (10 buckets)
- ContentStatus decay bar in SpaceDetail posts table
- Alert system: low_swimmers, high_risk_posts, stale_sync, low_avg_heat
- Sponsorship analytics (offer counts, slot utilization)
- Blocklist management (client-side)

**Key Files:** `Dashboard.tsx`, `SpaceDetail.tsx`, `SponsorshipAnalytics.tsx`, `MetricsCollector.ts`, `ContentStatus.tsx`

---

### 6. Archiver Client (`archiver-client/`, port 5177)

**Role:** Content preservation via automated PoW engagement.

**Content Features:**
- ContentMonitor using SPEC_02 decay formula:
  - `survival = 0.5^((timeSinceEngagement - DECAY_FLOOR) / HALF_LIFE)`
  - HALF_LIFE = 604,800s (7 days), DECAY_FLOOR = 3,600s (1 hour)
  - DECAY_THRESHOLD = 6.25% (4 half-lives)
- Urgency classification: critical (<5%), warning (<10%), normal (>=10%)
- AutoEngageEngine: automatic PoW contribution to at-risk content
  - Priority: heat urgency (50%) + reply value (30%) + pool progress (20%)
  - Daily PoW budget with UTC midnight reset
  - Refuses spam-flagged content (SPEC_12)
- ContentStatus with "Preserved" state for archived content
- IndexedDB archive storage with full-text search
- Configurable thresholds: archive %, auto-engage %, storage budget (GB)

**Key Files:** `Dashboard.tsx`, `ArchivedContent.tsx`, `ContentMonitor.ts`, `AutoEngageEngine.ts`, `ContentStatus.tsx`

---

### 7. Bridge Client (`bridge-client/`, port 5176)

**Role:** Cross-platform message bridge (Matrix/IRC <-> Swimchain).

**Content Features:**
- BridgeEngine for bidirectional bridging
- PoW mining for inbound messages (10s per bridged post)
- Daily PoW budget tracking (default 3600s/day)
- ContentStatus decay indicator in ActivityLog
- Echo prevention (EchoTracker avoids re-bridging own messages)
- Rate limiting (max posts/hour configurable)
- Spam filtering (checks SPEC_12 attestation status)
- Private space key management (AES-256-GCM)
- Blocklist integration (filters blocked users before bridging)
- Activity log: message_bridged, error, connection, rate_limited, spam_blocked
- Identity sync from node via RPC

**Key Files:** `Dashboard.tsx`, `ActivityLog.tsx`, `BridgeEngine.ts`, `ContentStatus.tsx`, `Settings.tsx`

---

## Decay Implementation Comparison

All clients implementing decay use the 7-day half-life formula from SPEC_02:

```
survivalPct = Math.pow(0.5, ageDays / 7) * 100
```

| Age | Survival % | Typical Label |
|-----|-----------|---------------|
| 0 days | 100% | Protected/Alive |
| 3.5 days | 71% | Active/Alive |
| 7 days | 50% | Active/Fading |
| 14 days | 25% | Stale/Fading |
| 21 days | 12.5% | Stale |
| 28 days | 6.25% | Decaying |

Engagement (replies, reactions) resets the decay timer. Spam-flagged content decays with a 4-hour half-life.

| Client | Decay Formula | Status Labels | Spam 4h Decay |
|--------|--------------|---------------|---------------|
| Forum | `pow(0.5, ageDays/7) * 100` | Healthy/Active/Stale/Decaying | Not visually distinct |
| Chat | Not implemented | N/A | N/A |
| Feed | State-based mapping | protected/active/stale/decayed | Not visually distinct |
| Search | `pow(0.5, ageDays/7) * 100` | alive/fading/stale/decaying | Not visually distinct |
| Analytics | `pow(0.5, ageDays/7) * 100` | alive/fading/stale/decaying | Not implemented |
| Archiver | `0.5^((t - floor) / halfLife)` | alive/fading/at risk/decaying + Preserved | Excluded from engage |
| Bridge | `pow(0.5, ageDays/7) * 100` | alive/fading/stale/decaying | Not visually distinct |

---

## Proof-of-Work Requirements (Testnet)

| Action | Difficulty | Approx Time | Clients |
|--------|-----------|-------------|---------|
| Space creation | 12-bit | ~60s | forum |
| Post creation | 12-bit | ~60s | forum, feed |
| Reply | 8-bit | ~30s | forum, chat, feed |
| Reaction (pool) | 10 seconds | 10s | forum, chat, feed |
| Spam report | 8-bit | ~30s | forum, chat, feed |
| Identity | 20-bit | ~5 min | chat, feed |
| Bridge message | 10 seconds | 10s | bridge |
| Auto-engage | configurable | varies | archiver |

---

## Content Flow Patterns

### Forum/Feed (Creation)
```
User writes post -> PoW mining (Argon2id) -> Sign with identity -> Submit via RPC -> Navigate to post
```

### Chat (Messaging)
```
User types message -> Enter to send -> PoW mining -> Sign -> Submit as reply -> Optimistic display -> Confirm on poll
```

### Archiver (Preservation)
```
ContentMonitor scans spaces -> Identifies < 10% heat -> AutoEngageEngine queues by priority -> Mines PoW -> Extends content life
```

### Bridge (Cross-platform)
```
External message arrives -> EchoTracker check -> Rate limit check -> Mine 10s PoW -> Format with platform prefix -> Post to Swimchain
Swimchain content detected -> Spam check -> Echo check -> Format with CS prefix -> Send to Matrix/IRC
```

---

## Known Gaps and Issues

### Cross-Client
1. **Spam decay not visualized** - SPEC_02 defines 4-hour half-life for spam-flagged content, but no client shows this distinction visually
2. **Chat has no decay indicators** - Messages treated as permanent despite protocol decay mechanics
3. **Inconsistent identity model** - Forum/search/analytics/archiver use node-managed identity; chat/feed use browser-stored keypair
4. **Duplicated components** - ContentStatus, blocklist, ImageGallery, and other components are copied across clients instead of shared via `swimchain-react/`

### Per-Client Issues

| Client | Issue |
|--------|-------|
| Forum | Reply tree has no per-reply decay indicators |
| Forum | Thread list has no media previews or decay bars |
| Chat | No decay indicators at all |
| Chat | Unread counts marked TODO in ServerList |
| Chat | Server icons always undefined (fallback to initials) |
| Feed | User posts endpoint not implemented (feed only fetches from spaces) |
| Feed | Discover users tab is a stub ("Follow from profiles") |
| Search | Pagination fallback calls loadMore() sequentially (inefficient for large jumps) |
| Search | Highlighting truncates at 200 chars regardless of match position |
| Analytics | `engagementsLast24h` always returns 0 (TODO in MetricsCollector) |
| Archiver | Archived content shows original heat only, no current decay recalculation |
| Bridge | Spam check has no explicit cache TTL |
