# Not Implemented Sweep Report

**Date:** 2026-02-17
**Scope:** All 7 swimchain client apps (forum, chat, feed, search, analytics, archiver, bridge)
**Method:** 6 feature owners + 1 automated explorer scanned all `src/` directories for TODO, FIXME, stubs, placeholders, hardcoded/mock data, dead code, and non-functional UI elements.

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total stubs found** | **68** (deduplicated) |
| **CRITICAL** | 10 |
| **HIGH** | 22 |
| **MEDIUM** | 20 |
| **LOW** | 16 |
| **Cleanest client** | search-client (5 issues, 0 CRITICAL) |
| **Most issues** | chat-client (21 issues, 3 CRITICAL) |

### Stubs Per Client

| Client | CRITICAL | HIGH | MEDIUM | LOW | Total |
|--------|:--------:|:----:|:------:|:---:|:-----:|
| forum-client | 2 | 4 | 4 | 4 | **14** |
| chat-client | 3 | 8 | 5 | 5 | **21** |
| feed-client | 0 | 4 | 3 | 2 | **9** |
| search-client | 0 | 2 | 2 | 1 | **5** |
| analytics-client | 0 | 3 | 1 | 2 | **6** |
| archiver-client | 2 | 0 | 3 | 1 | **6** |
| bridge-client | 3 | 2 | 1 | 1 | **7** |

---

## CRITICAL Issues (10)

These show fake data as real, bypass security, or prevent entire features from working.

| # | Client | File | Line | Issue | Found By |
|---|--------|------|------|-------|----------|
| C1 | **chat-client** | `src/contexts/PresenceContext.tsx` | 34-41 | Presence panel initializes from `mockPresenceStates` — 8 hardcoded fake users shown as "online/away/offline". Real users always appear "offline" because their addresses never match mock data. | Identity, Content, Moderation, Navigation |
| C2 | **chat-client** | `src/contexts/TypingContext.tsx` | 16, 51, 89 | `currentUser` imported from `mocks/data.ts` is hardcoded as `cs1qabcdef...abc1`. Real user's typing is never suppressed for themselves. Fake identity broadcasts. | Identity, Content, Moderation |
| C3 | **chat-client** | `src/components/MessageStream.tsx` | 9, 132 | `getPresenceForUser()` from `mocks/data.ts` — every message presence dot is sourced from fake data. All real message authors show as "offline". | Identity, Content, Navigation |
| C4 | **forum-client** | `src/pages/SpaceList.tsx` | 128-129 | Space creation uses `signature = '0'.repeat(128)` — all-zeros fake Ed25519 signature. Bypasses signature verification. Comment: "placeholder - in production this would sign the request". | Content, Sponsorship, Moderation, Navigation |
| C5 | **forum-client** | `src/components/StartDMButton.tsx` | 128-136 | DM request sends `powNonce: 0`, `powDifficulty: 0`, `powNonceSpace: '00'.repeat(32)`, `powHash: '00'.repeat(32)`. All zeros — bypasses anti-spam PoW entirely. Comment: "TODO: Add proper PoW mining". | Identity, Content, Sponsorship, Moderation, Navigation |
| C6 | **archiver-client** | `src/providers/IdentityProvider.tsx` | 24 | `RPC_URL` hardcoded to `localhost:19736` (testnet). Bypasses shared RPC config entirely. Will silently fail on mainnet or any non-default deployment. | Navigation |
| C7 | **archiver-client** | `src/services/ContentMonitor.ts` | 155 | `contributorCount: 0` hardcoded with "Not tracked" comment. Pool contributor count in AtRiskList is always 0 — fake data displayed as real metric. | Navigation |
| C8 | **bridge-client** | `src/App.tsx` | 18-41 | `RpcProvider` is never mounted. All `useRpc()` consumers get dead defaults (`rpc: null`, `connected: false`). NodeStatusBar always shows "Disconnected". Bridge engine can never connect. | Navigation |
| C9 | **bridge-client** | `src/lib/rpc.ts` | 83 | `rpcEndpoint` hardcoded to `localhost:19736` regardless of config. All JSON-RPC calls always hit testnet port. | Navigation |
| C10 | **bridge-client** | `src/pages/Identity.tsx` | 16 | `RPC_URL` hardcoded to `localhost:19736`, bypassing shared RPC infrastructure. | Navigation |

---

## HIGH Issues (22)

Buttons/links that exist but do nothing, or significant functionality gaps.

| # | Client | File | Line | Issue | Found By |
|---|--------|------|------|-------|----------|
| H1 | **chat-client** | `src/mocks/data.ts` | 1-293 | 293-line mock file actively imported by 7 production components (PresenceContext, TypingContext, MessageBubble, ThreadPanel, OnlineUsers, MessageStream, TypingIndicator). Root cause of C1-C3. | Identity, Content, Moderation |
| H2 | **chat-client** | `src/components/MessageBubble.tsx` | 9 | Imports `truncateAddress` from `mocks/data.ts` — production component depends on mock module. | Moderation |
| H3 | **chat-client** | `src/components/ThreadPanel.tsx` | 8 | Imports `truncateAddress` from `mocks/data.ts` — production component depends on mock module. | Moderation |
| H4 | **chat-client** | `src/components/OnlineUsers.tsx` | 7 | Imports `truncateAddress` from `mocks/data.ts` — production component depends on mock module. | Moderation |
| H5 | **chat-client** | `src/components/TypingIndicator.tsx` | 5 | Imports `truncateAddress` from `mocks/data.ts` — production component depends on mock module. | Moderation |
| H6 | **chat-client** | `src/components/MessageStream.tsx` | 9 | Imports `getPresenceForUser` from `mocks/data.ts` — production component uses mock presence lookup. | Moderation |
| H7 | **chat-client** | `src/components/MessageBubble.tsx` | 47-58 | `handleReactQuick` and `handleReactStandard` only `await setTimeout(1000/3000ms)` — simulate PoW delay but submit nothing. Engagement buttons are inert. | Identity |
| H8 | **chat-client** | `src/components/MessageBubble.tsx` | 68-70 | `handleMore` callback is empty `useCallback` stub: `// TODO: Show more options menu`. Button renders but does nothing. | Identity, Content, Moderation, Navigation |
| H9 | **chat-client** | `src/components/ChannelSidebar.tsx` | 262-264 | "Create a channel" navigates to `/channels/:serverId/new` — route doesn't exist, silently redirects to `/`. | Navigation |
| H10 | **chat-client** | `src/pages/Chat.tsx` | 423-425 | "Create Channel" button in empty-server state — same dead route as H9. | Navigation |
| H11 | **chat-client** | `src/App.tsx` | 86-93 | `/servers/discover` route renders `<Chat />` with no `serverId` — shows empty layout with no discovery UI. | Navigation |
| H12 | **chat-client** | `src/components/ReportModal.tsx` | 104-107, 142 | When no `onSubmit` handler provided, logs to console and shows "Report Submitted" + "We'll review this content" — misleading for decentralized system. | Moderation |
| H13 | **chat-client** | `src/hooks/useRealTimeUpdates.ts` | 56-67 | Poll loop is a no-op — `// For now, we don't add fake messages`. Messages only load on mount, no live polling for new content. | Content, Navigation |
| H14 | **forum-client** | `src/components/SpaceSettings.tsx` | 114-116 | `handleLeave` has `// TODO: Call leave RPC with proper signature`. Only removes local key and navigates away; no leave RPC called, membership not revoked on network. | Identity, Sponsorship, Moderation, Navigation |
| H15 | **forum-client** | `src/components/NodeStatusBar.tsx` | 103-112 | "Restart Node" button does nothing — sets an error message asking user to restart manually. Button appears enabled/clickable. | Navigation |
| H16 | **forum-client** | `src/hooks/useKeyboardNavigation.tsx` | 97-103 | `e`/`E` shortcuts (Engage +5s/+15s) only `console.log` — advertised in shortcuts modal but do nothing. | Identity, Moderation, Navigation |
| H17 | **feed-client** | `src/pages/Discover.tsx` | 218-227 | "Users" tab shows `<h2>User discovery coming soon</h2>`. Tab is fully navigable but empty. | Content, Moderation, Navigation |
| H18 | **feed-client** | `src/hooks/useKeyboardNavigation.tsx` | 97-103 | Same as H16 — `e`/`E` engage shortcuts just `console.log`, no PoW mining. | Identity, Moderation, Navigation |
| H19 | **feed-client** | `src/components/NodeStatusBar.tsx` | 118-125 | "Restart Node" button shows error message instead of restarting. Same pattern as H15. | Navigation |
| H20 | **feed-client** | `src/components/NodeStatusBar.tsx` | 261 | `onSettingsClick` prop always `undefined` — "Settings" button in node dropdown does nothing. | Navigation |
| H21 | **search-client** | `src/pages/Home.tsx` | 135-138 | Footer links (`/about`, `/help`, `/privacy`, `/terms`) point to unregistered routes — all silently redirect to `/`. | Navigation |
| H22 | **search-client** | `src/pages/Results.tsx` | 118-123 | Footer links (`/help`, `/about`) — same dead route issue as H21. | Navigation |
| H23 | **analytics-client** | `src/services/MetricsCollector.ts` | 404-413 | When disconnected, returns `activeSwimmers: 0`, `postsAtRisk: 0`, `avgHeat: 0` as if real data. Dashboard shows zeros with no disconnect indicator. | Navigation |
| H24 | **analytics-client** | `src/services/MetricsCollector.ts` | 483-491 | When disconnected, returns `postCount: 0`, `memberCount: 0`, `posts: []` as real data. Same fake-zero pattern for space stats. | Navigation |
| H25 | **analytics-client** | `src/types/index.ts` | 248-250 | `getHealthStatus()` has dead branch — duplicate `DEGRADED` return for scores 40-79. `UNHEALTHY` status can never be reached. | Navigation |
| H26 | **bridge-client** | `src/services/BridgeEngine.ts` | 534-535 | PoW difficulty/config hardcoded to `testnet` (`true`). Mainnet posts would use 10% difficulty and be rejected. | Navigation |

---

## MEDIUM Issues (20)

TODO comments indicating unbuilt functionality, or partially working features.

| # | Client | File | Line | Issue | Found By |
|---|--------|------|------|-------|----------|
| M1 | **chat-client** | `src/hooks/useMessages.ts` | 35 | `authorName: undefined, // TODO: Lookup display names` — display names never resolved. | Identity, Content, Moderation |
| M2 | **chat-client** | `src/hooks/useMessages.ts` | 40 | `reactions: [], // TODO: Fetch reactions` — reactions array always empty on receive. | Identity, Content, Moderation |
| M3 | **chat-client** | `src/hooks/useServers.ts` | 58 | `unreadCount: 0, // TODO: Track unread counts per server` — badge counts always zero. | Identity, Content, Sponsorship |
| M4 | **chat-client** | `src/hooks/useRealTimeUpdates.ts` | 52-68 | Heat-decay simulation runs client-side `Math.random()` decay, overriding actual chain values. | Navigation |
| M5 | **chat-client** | `src/components/ChannelSidebar.tsx` | 272-276 | User area shows hardcoded "You" username and empty grey avatar placeholder instead of real identity. | Identity, Navigation |
| M6 | **forum-client** | `src/hooks/useSyncStatus.ts` | 50-51 | `peersReceiving: 0, peersSending: 0` hardcoded — RPC doesn't provide directional peer data yet. | Content, Sponsorship, Navigation |
| M7 | **forum-client** | `src/components/SpaceTree.tsx` | 18, 47 | `TODO: Implement hierarchical spaces` — space tree is stub, always flat. Toggle span appears expandable but is not interactive. | Content, Sponsorship, Navigation |
| M8 | **forum-client** | `src/components/DebugPanel.tsx` | 237, 252-257 | "Node Logs" section shows static file path instead of actual logs. "Placeholder for future". | Content, Navigation |
| M9 | **forum-client** | `src/components/StartDMButton.tsx` | 111, 118 | `void _encryptedKeyForSelf` / `void _encryptedName` — reserved for future backend support. | Sponsorship |
| M10 | **feed-client** | `src/hooks/useFeed.ts` | 239-241 | `// TODO: When user posts endpoint is available, fetch from users` — user-based feed unimplemented. | Content, Moderation, Sponsorship |
| M11 | **feed-client** | `src/hooks/useFeed.ts` | (various) | User post feeds silently skipped. Follow-user feature partially broken as feed source. | Content |
| M12 | **analytics-client** | `src/services/MetricsCollector.ts` | 258 | `engagementsLast24h: 0, // TODO: Fetch from API` — engagement metric hardcoded to 0. | Identity, Content, Sponsorship, Navigation |
| M13 | **archiver-client** | `src/hooks/useRpc.tsx` | 77 | Console log says "Analytics client connecting" — copy-paste from analytics-client. | Navigation |
| M14 | **archiver-client** | `src/hooks/useRpc.tsx` | 266 | Space name falls back to truncated ID (`spaceId.substring(0,12) + '...'`). | Navigation |
| M15 | **archiver-client** | `src/components/EngageButton.tsx` | 107-110 | PoW progress bar uses hardcoded `expectedAttempts = 64` (testnet difficulty 6). On mainnet (~65536 attempts) the bar instantly hits 99% and stalls. | Navigation |
| M16 | **archiver-client** | `src/services/ContentMonitor.ts` | 180 | Spam status check catches errors and proceeds — fails open, potentially auto-engaging spam content. | Moderation |
| M17 | **bridge-client** | `src/services/BridgeEngine.ts` | 151-152 | Spam check catches errors, returns `false` — fails open, bridging potentially spam-flagged content to external platforms. | Moderation |
| M18 | **bridge-client** | `src/pages/Dashboard.tsx` | 89-95 | Dashboard renders duplicate `<nav>` header on top of MainLayout nav. Double navigation bar. | Navigation |
| M19 | **search-client** | `src/App.tsx` | 62 | `RedirectToForum` receives `_type` param but never uses it — all cross-client redirects go to identical URL. | Navigation |
| M20 | **search-client** | `src/hooks/useSearchSuggestions.ts` | 95-99 | On RPC failure, falls back to user's own search history labeled as "Suggested Searches" — no degradation indicator. | Navigation |

---

## LOW Issues (16)

Cosmetic placeholders, dead code, debug logging left in production.

| # | Client | File | Line | Issue | Found By |
|---|--------|------|------|-------|----------|
| L1 | **chat-client** | `src/components/ChannelSidebar.tsx` | 274, 280 | `<div class="avatar-placeholder" />` — empty grey circle for avatar. | Identity |
| L2 | **chat-client** | `src/components/OnlineUsers.tsx` | 7 | `truncateAddress` utility imported from `mocks/data.ts` (only utility usage, not mock data). | Content |
| L3 | **chat-client** | `src/components/TypingIndicator.tsx` | 5 | `truncateAddress` utility from `mocks/data.ts` — same as L2. | Content |
| L4 | **chat-client** | `src/components/ThreadPanel.tsx` | 8 | `truncateAddress` utility from `mocks/data.ts` — same as L2. | Content |
| L5 | **chat-client** | `src/components/DebugPanel.tsx` | 297 | `<div className="log-placeholder">` — log viewer not implemented. Debug feature. | Content |
| L6 | **forum-client** | `src/mocks/data.ts` | 1-431 | Full mock dataset (spaces, threads, replies, sync). NOT imported by any production file — dead code. | Content, Moderation |
| L7 | **forum-client** | `src/hooks/useBlocklist.ts` | 157, 169, 178 | `console.log('[Blocklist]...')` — debug logging in production. | Moderation |
| L8 | **chat-client** | `src/hooks/useBlocklist.ts` | 157, 169, 178 | `console.log('[Blocklist]...')` — debug logging in production. Same as L7. | Moderation |
| L9 | **feed-client** | `src/hooks/useBlocklist.ts` | 157, 169, 178 | `console.log('[Blocklist]...')` — debug logging in production. Same as L7. | Moderation |
| L10 | **forum-client** | `src/hooks/useRpc.tsx` | 2228, 2302, 2335, 2344 | Verbose debug logging for spam status/report flows. | Moderation |
| L11 | **feed-client** | `src/hooks/useRpc.tsx` | 2096, 2170, 2200, 2209 | Verbose debug logging for spam status/report flows. Same as L10. | Moderation |
| L12 | **chat-client** | `src/pages/Chat.tsx` | 249-316 | Multiple `console.log/warn/error` calls in report handling path. | Moderation |
| L13 | **feed-client** | `src/styles/app.css` | 168-191 | CSS class `.coming-soon` defined but never used by any component. Dead CSS. | Content, Moderation |
| L14 | **search-client** | `src/pages/Results.tsx` | 87-89 | Empty `header-actions` div with comment "Future: Identity button, settings" — renders blank space. | Navigation |
| L15 | **analytics-client** | `src/hooks/useRpc.tsx` | 288 | Space name fallback to raw `spaceId` string — spaces list shows addresses not names. | Navigation |
| L16 | **archiver-client** | `src/pages/Dashboard.tsx` | 232 | Footer version hardcoded to `v0.1.0` — will become stale. | Navigation |

---

## Root Cause Clusters

### Cluster 1: chat-client Mock Data Leak (C1, C2, C3, H1-H6, L2-L4)
**Root cause:** `chat-client/src/mocks/data.ts` is imported by 7 production components.
**Impact:** Fake presence, fake typing identity, fake user data displayed as real.
**Fix:** Extract `truncateAddress` utility to a shared lib. Remove mock imports from PresenceContext, TypingContext, MessageStream. Either implement real presence via peer tracking or remove presence entirely.

### Cluster 2: forum-client Security Bypasses (C4, C5, H14)
**Root cause:** Space creation and DM features were built with placeholder crypto.
**Impact:** Null signatures and zero PoW bypass the protocol's anti-spam and authentication.
**Fix:** Wire `useSign` hook for signatures, wire `useActionPow` for PoW. Forum-client has these hooks available but they're not used in these code paths.

### Cluster 3: bridge-client Non-Functional RPC (C8, C9, C10, H26)
**Root cause:** `RpcProvider` never mounted in App.tsx, and all RPC URLs hardcoded to testnet.
**Impact:** Entire bridge-client cannot connect to any node. All features are dead.
**Fix:** Mount RpcProvider in App.tsx. Replace hardcoded URLs with VITE_RPC_PORT env var pattern.

### Cluster 4: archiver-client Hardcoded Config (C6, C7, M13-M16)
**Root cause:** Copy-paste from analytics-client with testnet-specific values.
**Impact:** Will break on mainnet. Contributor counts always zero. Spam checks fail open.
**Fix:** Use shared VITE_RPC_PORT config. Implement contributor count RPC. Make spam check fail closed.

### Cluster 5: Inert "Restart Node" Buttons (H15, H19)
**Root cause:** forum-client and feed-client both have NodeStatusBar with a restart button that can't actually restart a P2P node from a web browser.
**Fix:** Either remove the button or change it to "Open Node Manager" linking to CLI docs.

### Cluster 6: Dead Keyboard Shortcuts (H16, H18)
**Root cause:** forum-client and feed-client both have `e`/`E` engage shortcuts that console.log instead of calling PoW engagement.
**Fix:** Wire to `usePoolContribution` or equivalent engagement hook with real PoW.

### Cluster 7: Debug Logging in Production (L7-L12)
**Root cause:** Blocklist, spam report, and chat flows have verbose console.log left from development.
**Fix:** Remove or gate behind `import.meta.env.DEV`.

---

## Recommended Fix Priority

### Immediate (Security/Broken)
1. **C4+C5:** forum-client fake signature and zero PoW — security bypass
2. **C8+C9+C10:** bridge-client RpcProvider not mounted — entire client broken
3. **C1+C2+C3+H1:** chat-client mock data in production — fake social signals

### High Priority (UX Impact)
4. **C6+C7:** archiver-client hardcoded testnet config
5. **H7:** chat-client inert engagement buttons
6. **H9+H10+H11:** chat-client dead routes (create channel, server discover)
7. **H13:** chat-client real-time updates no-op
8. **H14:** forum-client leave-space doesn't notify network
9. **H23+H24:** analytics-client fake zeros when disconnected
10. **H25:** analytics-client dead health status branch

### Medium Priority (Missing Features)
11. **M1+M2+M3:** chat-client missing display names, reactions, unread counts
12. **M10+M11:** feed-client user post feeds not implemented
13. **H17:** feed-client user discovery "coming soon"
14. **M15:** archiver-client PoW progress bar hardcoded to testnet
15. **M16+M17:** archiver/bridge fail-open spam checks
16. **H15+H19:** Inert "Restart Node" buttons

### Low Priority (Cosmetic/Cleanup)
17. **L6:** Delete unused forum-client mocks/data.ts
18. **L7-L12:** Remove debug console.log from production
19. **L13:** Delete unused `.coming-soon` CSS
20. **H21+H22:** Remove dead footer links in search-client

---

## Scan Methodology

### Sources (6 feature owners + 1 explorer agent)
| Owner | Focus Area | Request ID | Tool Count |
|-------|-----------|------------|------------|
| Identity-Owner | Identity stubs, fake addresses, broken import | `chat_11_1771369876355` | 1 |
| Sponsorship-Owner | Sponsorship stubs, fake offers, PoW bypasses | `chat_12_1771369876443` | 7 |
| Content-Owner | Content stubs, mock posts, broken posting | `chat_13_1771369876529` | 23 |
| Navigation-Owner | Dead routes, empty pages, broken layouts | `chat_14_1771369876610` | 5 |
| PrivateSpace-Owner | Fake encryption, mock invites, key stubs | `chat_15_1771369876710` | 39 |
| Moderation-Owner | Non-functional blocks, fake reports, spam gaps | `chat_16_1771369876825` | 1 |

### Search Patterns
```
TODO, FIXME, not implemented, stub, placeholder, hardcoded, mock, dummy,
fake, coming soon, lorem, console.log("TODO"), throw new Error("not implemented"),
empty function bodies, commented-out code blocks
```

### Deduplication
Multiple owners found the same issues. Each finding was attributed to the first owner who reported it, with additional confirmations noted in the "Found By" column. Total raw findings: ~120. After deduplication: 68 unique issues.
